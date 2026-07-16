import { TRPCError } from "@trpc/server";
import { joinQueueInputSchema } from "@sr/core";
import { createTRPCRouter, protectedProcedure } from "../init";
import { ensureDbUser } from "../../users";
import { dequeue, enqueue, heartbeat } from "../../matchmaking";
import { redis } from "../../redis";

/**
 * Matchmaking queue (PRD §5.3, FR-9). Join / leave / heartbeat. Pairing (finding a
 * compatible waiting user) lands in the next step.
 *
 * Authorization: every procedure acts on the authenticated caller's OWN id (no user-id
 * input), and joining is limited to practitioners (recruiters/managers don't roleplay).
 */
export const matchmakingRouter = createTRPCRouter({
  /** Enter the queue for a track (+ optional scenario) declaring a preferred role. */
  joinQueue: protectedProcedure.input(joinQueueInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    if (user.role !== "PRACTITIONER" && user.role !== "ADMIN") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only practitioners can join the roleplay queue.",
      });
    }

    // A specific scenario must exist, be active, and belong to the chosen track.
    if (input.scenarioId) {
      const scenario = await ctx.prisma.scenario.findUnique({ where: { id: input.scenarioId } });
      if (!scenario || !scenario.active) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That scenario isn't available." });
      }
      if (scenario.track !== input.track) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That scenario doesn't belong to the selected track.",
        });
      }
    }

    // Durable record: supersede any existing WAITING request, then create a fresh one.
    await ctx.prisma.matchRequest.updateMany({
      where: { userId: user.id, status: "WAITING" },
      data: { status: "CANCELED" },
    });
    const request = await ctx.prisma.matchRequest.create({
      data: {
        userId: user.id,
        track: input.track,
        scenarioId: input.scenarioId ?? null,
        preferredRole: input.preferredRole,
        status: "WAITING",
      },
    });

    // Live queue (Redis).
    await enqueue(redis, {
      userId: user.id,
      track: input.track,
      scenarioId: input.scenarioId,
      preferredRole: input.preferredRole,
    });

    return { requestId: request.id, status: "WAITING" as const };
  }),

  /** Leave the queue (explicit cancel). */
  leaveQueue: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    await dequeue(redis, user.id);
    await ctx.prisma.matchRequest.updateMany({
      where: { userId: user.id, status: "WAITING" },
      data: { status: "CANCELED" },
    });
    return { ok: true };
  }),

  /** Keep the caller's queue entry alive (client calls this on an interval). */
  heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    const inQueue = await heartbeat(redis, user.id);
    return { inQueue };
  }),
});

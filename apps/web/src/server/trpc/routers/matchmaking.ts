import { TRPCError } from "@trpc/server";
import { joinQueueInputSchema } from "@sr/core";
import { createTRPCRouter, protectedProcedure } from "../init";
import { ensureDbUser } from "../../users";
import { dequeue, heartbeat, joinAndPair, readQueueState, redis } from "@sr/jobs";

/**
 * Matchmaking (PRD §5.3). Joining pairs atomically on enqueue (see @/server/matchmaking);
 * the already-waiting user discovers the match by polling getQueueStatus.
 *
 * Authorization: every procedure acts on the authenticated caller's OWN id (no user-id
 * input); joining is limited to practitioners (recruiters/managers don't roleplay).
 */
export const matchmakingRouter = createTRPCRouter({
  /** Enter the queue for a track (+ optional scenario) and pair if a match is waiting. */
  joinQueue: protectedProcedure.input(joinQueueInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    if (user.role !== "PRACTITIONER" && user.role !== "ADMIN") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only practitioners can join the roleplay queue.",
      });
    }

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

    return joinAndPair(redis, ctx.prisma, {
      userId: user.id,
      experienceLevel: user.experienceLevel,
      track: input.track,
      scenarioId: input.scenarioId,
      preferredRole: input.preferredRole,
    });
  }),

  /**
   * Poll for match status (FR-11). The already-waiting user learns their session id here;
   * returns IDLE once they've left / gone stale.
   */
  getQueueStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    const { matchSessionId, queued } = await readQueueState(redis, user.id);

    if (matchSessionId) {
      const session = await ctx.prisma.session.findUnique({
        where: { id: matchSessionId },
        select: { id: true, sellerId: true, counterpartId: true },
      });
      if (session && (session.sellerId === user.id || session.counterpartId === user.id)) {
        return {
          status: "MATCHED" as const,
          sessionId: session.id,
          role: session.sellerId === user.id ? ("seller" as const) : ("counterpart" as const),
        };
      }
    }

    return queued ? { status: "WAITING" as const } : { status: "IDLE" as const };
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

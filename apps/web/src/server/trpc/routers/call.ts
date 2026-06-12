import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { serverEnv } from "@sr/config/env.server";
import { createSessionInputSchema, sessionIdInputSchema } from "@sr/core";
import { createTRPCRouter, protectedProcedure } from "../init";
import { ensureDbUser } from "../../users";
import { closeRoom, createAccessToken, startRecording, stopRecording } from "../../livekit";
import { getSignedPlaybackUrl } from "../../r2";
import type { TRPCContext } from "../init";

type SessionRow = Awaited<ReturnType<typeof loadSession>>;

async function loadSession(ctx: TRPCContext, sessionId: string) {
  const session = await ctx.prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      seller: { select: { id: true, name: true, avatarUrl: true } },
      counterpart: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
  return session;
}

/** Caller's relationship to the session. Throws if they have no business here. */
function roleFor(session: NonNullable<SessionRow>, userId: string) {
  if (session.sellerId === userId) return "seller" as const;
  if (session.counterpartId === userId) return "counterpart" as const;
  // An invitee may view/join only while the seat is open.
  if (!session.counterpartId && session.status !== "ENDED") return "invitee" as const;
  throw new TRPCError({ code: "FORBIDDEN", message: "You are not a participant in this call." });
}

function toView(session: NonNullable<SessionRow>, role: "seller" | "counterpart" | "invitee") {
  return {
    id: session.id,
    status: session.status,
    role,
    videoEnabled: session.videoEnabled,
    durationMinutes: session.durationMinutes,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    recordingStatus: session.recordingStatus,
    hasRecording: Boolean(session.recordingKey),
    seller: session.seller,
    counterpart: session.counterpart,
  };
}

export const callRouter = createTRPCRouter({
  /** Host creates a session; returns the id used for the shareable /call/[id] link. */
  createSession: protectedProcedure
    .input(createSessionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ensureDbUser(ctx.clerkAuth.userId);
      const session = await ctx.prisma.session.create({
        data: {
          roomId: `sr_${randomUUID()}`,
          sellerId: user.id,
          videoEnabled: input.videoEnabled,
          durationMinutes: input.durationMinutes,
        },
      });
      return { sessionId: session.id };
    }),

  /** Read-only session view for the call page (participants + invitee). */
  getSession: protectedProcedure.input(sessionIdInputSchema).query(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    const session = await loadSession(ctx, input.sessionId);
    return toView(session, roleFor(session, user.id));
  }),

  /**
   * Assign the caller as counterpart if the seat is open, then mint a LiveKit join
   * token. Authorization: only the seller or the (claimed) counterpart can get a token.
   */
  getJoinToken: protectedProcedure.input(sessionIdInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    const session = await loadSession(ctx, input.sessionId);
    if (session.status === "ENDED" || session.status === "CANCELED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This call has ended." });
    }

    let role = roleFor(session, user.id);
    if (role === "invitee") {
      // Claim the open counterpart seat atomically (guards against two invitees).
      const claim = await ctx.prisma.session.updateMany({
        where: { id: session.id, counterpartId: null },
        data: { counterpartId: user.id },
      });
      if (claim.count !== 1) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This call is already full." });
      }
      role = "counterpart";
    }

    const token = await createAccessToken({
      room: session.roomId,
      identity: user.id,
      name: user.name ?? undefined,
    });
    return { token, serverUrl: serverEnv.NEXT_PUBLIC_LIVEKIT_URL };
  }),

  /**
   * Host marks the call live once connected and starts recording (once). Idempotent:
   * safe to call repeatedly. Recording failure does not fail the call.
   */
  markLive: protectedProcedure.input(sessionIdInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    const session = await loadSession(ctx, input.sessionId);
    roleFor(session, user.id); // authorize (participant only)

    if (session.status === "PENDING") {
      await ctx.prisma.session.update({
        where: { id: session.id },
        data: { status: "LIVE", startedAt: new Date() },
      });
    }

    // Claim the right to start egress exactly once.
    const claim = await ctx.prisma.session.updateMany({
      where: { id: session.id, recordingStatus: "NONE" },
      data: { recordingStatus: "RECORDING" },
    });
    if (claim.count === 1) {
      try {
        const { egressId, recordingKey } = await startRecording({
          room: session.roomId,
          videoEnabled: session.videoEnabled,
        });
        await ctx.prisma.session.update({
          where: { id: session.id },
          data: { egressId, recordingKey },
        });
      } catch {
        await ctx.prisma.session.update({
          where: { id: session.id },
          data: { recordingStatus: "FAILED" },
        });
      }
    }

    const updated = await loadSession(ctx, input.sessionId);
    return toView(updated, roleFor(updated, user.id));
  }),

  /** Either participant ends the call: stop recording, close room, mark ended. */
  endSession: protectedProcedure.input(sessionIdInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    const session = await loadSession(ctx, input.sessionId);
    roleFor(session, user.id);

    if (session.egressId && session.recordingStatus === "RECORDING") {
      try {
        await stopRecording(session.egressId);
      } catch {
        // egress may already be stopping; the webhook reconciles final state.
      }
    }
    if (session.status !== "ENDED") {
      await ctx.prisma.session.update({
        where: { id: session.id },
        data: { status: "ENDED", endedAt: new Date() },
      });
    }
    try {
      await closeRoom(session.roomId);
    } catch {
      // room may already be gone.
    }
    return { ok: true };
  }),

  /** Short-lived signed URL to review the recording (participants only). */
  getRecordingUrl: protectedProcedure
    .input(sessionIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ensureDbUser(ctx.clerkAuth.userId);
      const session = await loadSession(ctx, input.sessionId);
      roleFor(session, user.id);
      if (!session.recordingKey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No recording is available yet." });
      }
      return { url: await getSignedPlaybackUrl(session.recordingKey) };
    }),
});

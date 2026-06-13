import { TRPCError } from "@trpc/server";
import {
  sessionIdInputSchema,
  type DeterministicMetrics,
  type DiarizedTranscript,
  type Moment,
  type ScoredDimension,
} from "@sr/core";
import { createTRPCRouter, protectedProcedure } from "../init";
import { ensureDbUser } from "../../users";
import { getSignedPlaybackUrl } from "../../r2";

/**
 * Read surface for the Phase 2 scoring pipeline — backs the rep detail view. Exposes the
 * scored rep (status, score, diarized transcript, signed recording URL).
 *
 * Authorization (CLAUDE.md "authorize every read"): a user can read only their OWN reps,
 * i.e. sessions where they were the seller (the scored subject). The counterpart is not
 * scored in v1, and recruiter access to *showcased* reps arrives with Showcase (Phase 4).
 */
export const scoreRouter = createTRPCRouter({
  /**
   * The seller's score + transcript + recording for a session. `status: "NONE"` means
   * scoring hasn't started; otherwise the Score status drives the UI ("analysis in
   * progress" / ready / "scoring failed, retry", FR-23).
   */
  getBySession: protectedProcedure.input(sessionIdInputSchema).query(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);

    const session = await ctx.prisma.session.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        sellerId: true,
        videoEnabled: true,
        recordingKey: true,
        recordingStatus: true,
      },
    });
    if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
    // Own reps only: the rep belongs to the seller.
    if (session.sellerId !== user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This rep isn't available to you." });
    }

    const [score, transcript] = await Promise.all([
      ctx.prisma.score.findUnique({
        where: {
          sessionId_subjectUserId: { sessionId: session.id, subjectUserId: session.sellerId },
        },
      }),
      ctx.prisma.transcript.findUnique({ where: { sessionId: session.id } }),
    ]);

    // Short-lived signed URL for the private recording (never served directly). 1h so the
    // player keeps working while the user reviews; the URL never leaves this response.
    const recordingUrl = session.recordingKey
      ? await getSignedPlaybackUrl(session.recordingKey, 3600)
      : null;

    return {
      status: score?.status ?? "NONE",
      transcriptStatus: transcript?.status ?? "NONE",
      recording: {
        url: recordingUrl,
        status: session.recordingStatus,
        videoEnabled: session.videoEnabled,
      },
      // The JSON columns were written via the @sr/core scoring contract, so casting back
      // to those types is sound and gives the client typed access.
      score: score
        ? {
            overall: score.overall,
            dimensions: (score.dimensionsJson ?? []) as ScoredDimension[],
            deterministic: score.deterministicJson as DeterministicMetrics | null,
            strengths: score.strengths,
            growthAreas: score.growthAreas,
            moments: (score.momentsJson ?? []) as Moment[],
            model: score.model,
            rubricVersion: score.rubricVersion,
            error: score.error,
          }
        : null,
      transcript: (transcript?.diarizedJson ?? null) as DiarizedTranscript | null,
      durationS: transcript?.durationS ?? null,
    };
  }),
});

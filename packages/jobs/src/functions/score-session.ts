import { NonRetriableError, type FailureEventArgs, type InngestFunction } from "inngest";
import { Prisma, prisma } from "@sr/db";
import {
  RUBRIC_VERSION,
  aggregate,
  computePerSpeakerMetrics,
  foldIntoSkillProfile,
  selectSellerMetrics,
  type DiarizedTranscript,
  type RollingSkillProfile,
} from "@sr/core";
import { inngest, sessionEndedEvent } from "../client";
import { getSignedRecordingUrl } from "../providers/r2";
import { getTranscript, normalizeTranscript, submitTranscript } from "../providers/assemblyai";
import { scoreTranscript } from "../providers/anthropic";

/**
 * The Phase 2 async scoring pipeline (PRD §6.2 / §9.5, DevOps handover §9). Triggered by
 * `session/ended` (emitted by the LiveKit webhook once a recording is READY). Durable,
 * retried, and idempotent per session:
 *
 *   init -> submit transcription -> poll (durable) -> score (Claude) -> persist -> notify
 *
 * Each external call is its own step so retries are granular. The transcript wait is a
 * poll loop with `step.sleep` between polls — durable, no long-running invocation, no
 * extra public webhook. On terminal failure, `onFailure` marks the Score/Transcript
 * FAILED so the UI can surface "scoring failed, retry" (FR-23).
 */

const POLL_INTERVAL = "15s";
const MAX_POLLS = 40; // ~10 min ceiling for transcription

const toJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

// Annotated as InngestFunction.Any so the exported type doesn't reference an internal
// inngest path (avoids the TS2742 "cannot be named" portability error).
export const scoreSession: InngestFunction.Any = inngest.createFunction(
  {
    id: "score-session",
    triggers: [sessionEndedEvent],
    // Cap concurrency to respect AssemblyAI + Anthropic rate limits (DevOps §9).
    concurrency: { limit: 5 },
    retries: 3,
    // Dedupe redelivered `session/ended` events for the same session.
    idempotency: "event.data.sessionId",
    onFailure: async ({ event, error }: FailureEventArgs) => {
      const { sessionId } = event.data.event.data as { sessionId?: string };
      if (!sessionId) return;
      const message = error instanceof Error ? error.message : String(error);
      await prisma.score.updateMany({
        where: { sessionId },
        data: { status: "FAILED", error: message },
      });
      await prisma.transcript.updateMany({
        where: { sessionId },
        data: { status: "FAILED", error: message },
      });
    },
  },
  async ({ event, step }) => {
    const { sessionId } = event.data;

    // 1. Load the session, ensure a recording exists, and stub the Score + Transcript
    //    rows so the UI immediately shows "analysis in progress" (FR-23). Idempotent via
    //    upsert so retries/replays reset cleanly.
    const ctx = await step.run("init", async () => {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NonRetriableError(`Session ${sessionId} not found`);
      if (session.recordingStatus !== "READY" || !session.recordingKey) {
        throw new NonRetriableError(`Session ${sessionId} has no ready recording to score`);
      }

      await prisma.score.upsert({
        where: { sessionId_subjectUserId: { sessionId, subjectUserId: session.sellerId } },
        create: { sessionId, subjectUserId: session.sellerId, status: "PROCESSING" },
        update: { status: "PROCESSING", error: null },
      });
      await prisma.transcript.upsert({
        where: { sessionId },
        create: { sessionId, status: "PENDING" },
        update: { status: "PENDING", error: null },
      });

      return { recordingKey: session.recordingKey, sellerId: session.sellerId };
    });

    // 2. Submit the recording to AssemblyAI (batch, diarized) via a short-lived signed URL.
    //    Idempotent within the step too: if a prior attempt already submitted a job, reuse
    //    its id rather than resubmitting (guards the retry-after-submit window — avoids a
    //    duplicate AssemblyAI job + wasted spend).
    const transcriptId = await step.run("submit-transcription", async () => {
      const existing = await prisma.transcript.findUnique({
        where: { sessionId },
        select: { externalId: true },
      });
      if (existing?.externalId) return existing.externalId;

      const url = await getSignedRecordingUrl(ctx.recordingKey);
      const submitted = await submitTranscript(url);
      await prisma.transcript.update({
        where: { sessionId },
        data: { externalId: submitted.id, status: "PROCESSING" },
      });
      return submitted.id;
    });

    // 3. Poll until the transcript is ready (durable: quick checks + sleeps, not a
    //    long-running invocation). On completion, normalize + persist the diarized turns.
    let diarized: DiarizedTranscript | null = null;
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      const poll = await step.run(`poll-${attempt}`, async () => {
        const t = await getTranscript(transcriptId);
        if (t.status === "error") return { done: true as const, error: t.error ?? "unknown" };
        if (t.status === "completed") {
          const normalized = normalizeTranscript(t);
          await prisma.transcript.update({
            where: { sessionId },
            data: {
              status: "READY",
              diarizedJson: toJson(normalized),
              sentimentJson: toJson(t.sentiment_analysis_results ?? []),
              durationS: Math.round(normalized.duration_s),
            },
          });
          return { done: true as const, transcript: normalized };
        }
        return { done: false as const };
      });

      if (poll.done) {
        if ("error" in poll && poll.error) {
          throw new Error(`AssemblyAI transcription failed: ${poll.error}`);
        }
        if ("transcript" in poll) diarized = poll.transcript;
        break;
      }
      await step.sleep(`wait-${attempt}`, POLL_INTERVAL);
    }

    if (!diarized) {
      throw new Error(`Transcription did not complete within ${MAX_POLLS} polls`);
    }
    const transcript = diarized;

    // 4. Score with Claude (cached rubric, structured output) + fold in deterministic
    //    metrics and aggregate. The Anthropic call is the only external op in this step.
    const scored = await step.run("score", async () => {
      const perSpeaker = computePerSpeakerMetrics(transcript);
      const { response, model } = await scoreTranscript({
        transcript,
        perSpeakerMetrics: perSpeaker,
      });
      const metrics = selectSellerMetrics(perSpeaker, response.seller_speaker);
      return { result: aggregate(response, metrics), model };
    });

    // 5. Persist the Score + roll the seller's SkillProfile, atomically. Guard the fold
    //    so a replay after a committed COMPLETE doesn't double-count the rep.
    const scoreId = await step.run("persist", async () => {
      const { result, model } = scored;
      const subjectUserId = ctx.sellerId;

      return prisma.$transaction(async (tx) => {
        const existing = await tx.score.findUnique({
          where: { sessionId_subjectUserId: { sessionId, subjectUserId } },
        });
        const alreadyComplete = existing?.status === "COMPLETE";

        const score = await tx.score.update({
          where: { sessionId_subjectUserId: { sessionId, subjectUserId } },
          data: {
            status: "COMPLETE",
            overall: result.overall,
            dimensionsJson: toJson(result.dimensions),
            deterministicJson: toJson(result.deterministic),
            strengths: result.strengths,
            growthAreas: result.growth_areas,
            momentsJson: toJson(result.moments),
            model,
            rubricVersion: RUBRIC_VERSION,
            error: null,
          },
        });

        if (!alreadyComplete) {
          const profile = await tx.skillProfile.findUnique({ where: { userId: subjectUserId } });
          const prev: RollingSkillProfile = profile
            ? {
                discovery: profile.discovery,
                objection: profile.objection,
                dmSetting: profile.dmSetting,
                closing: profile.closing,
                repsCount: profile.repsCount,
              }
            : { discovery: 0, objection: 0, dmSetting: 0, closing: 0, repsCount: 0 };
          const next = foldIntoSkillProfile(prev, result.track_scores);
          await tx.skillProfile.upsert({
            where: { userId: subjectUserId },
            create: { userId: subjectUserId, ...next },
            update: next,
          });
        }

        return score.id;
      });
    });

    // 6. Notify (Resend email is Phase 6; this drives the in-app "analysis ready" state).
    await step.sendEvent("emit-score-created", {
      name: "score/created",
      data: { sessionId, subjectUserId: ctx.sellerId, scoreId },
    });

    return { scoreId, overall: scored.result.overall };
  },
);

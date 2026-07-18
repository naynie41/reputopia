import { z } from "zod";
import { preferredRoleSchema, trackSchema } from "./enums";

/**
 * Matchmaking domain schemas (PRD §5.3). Shared by the tRPC router and the queue UI.
 */

/**
 * Join the queue for a track, optionally a specific scenario ("" / omitted = any in the
 * track, FR-9), declaring a preferred role. The scenario's existence + track match are
 * validated server-side.
 */
export const joinQueueInputSchema = z.object({
  track: trackSchema,
  scenarioId: z.string().min(1).optional(), // omitted = any scenario in the track
  preferredRole: preferredRoleSchema.default("EITHER"),
});
export type JoinQueueInput = z.infer<typeof joinQueueInputSchema>;

/**
 * How long a queue entry survives without a heartbeat before it's considered stale
 * (closed tab) and evicted — so it can't create a ghost match. The client heartbeats on
 * an interval shorter than this.
 */
export const QUEUE_ENTRY_TTL_SECONDS = 30;
export const QUEUE_HEARTBEAT_INTERVAL_SECONDS = 10;

/** Compatibility tolerances for pairing (PRD FR-10 "similar difficulty/level"). */
export const LEVEL_BAND = 2; // max experience-rank gap between paired users
export const DIFFICULTY_BAND = 1; // max scenario-difficulty gap
/** Don't re-pair the same two users within this window (FR-10 "not recently matched"). */
export const RECENT_MATCH_TTL_SECONDS = 60 * 60;

/** Lobby "get ready" countdown before a match is expected to start (FR-11). */
export const LOBBY_COUNTDOWN_SECONDS = 60;

/**
 * How long the durable no-show timer waits after a match is created before cancelling it
 * if both participants haven't readied (FR-12). Slightly longer than the lobby countdown.
 */
export const NO_SHOW_TIMEOUT_SECONDS = 75;

/** Experience level → numeric rank for proximity checks. -1 = unknown (don't filter). */
export const EXPERIENCE_LEVEL_RANK: Readonly<Record<string, number>> = {
  STUDENT: 0,
  JUNIOR: 1,
  MID: 2,
  SENIOR: 3,
  LEAD: 4,
};

export function experienceLevelToRank(level: string | null | undefined): number {
  return level && level in EXPERIENCE_LEVEL_RANK ? EXPERIENCE_LEVEL_RANK[level]! : -1;
}

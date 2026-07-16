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

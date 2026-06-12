import { z } from "zod";

/**
 * Live-call (Phase 1) shared contracts. Enums mirror the Prisma enums in
 * packages/db/prisma/schema.prisma — keep member names in sync.
 */

export const SESSION_STATUSES = ["PENDING", "LIVE", "ENDED", "CANCELED"] as const;
export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const RECORDING_STATUSES = ["NONE", "RECORDING", "READY", "FAILED"] as const;
export const recordingStatusSchema = z.enum(RECORDING_STATUSES);
export type RecordingStatus = z.infer<typeof recordingStatusSchema>;

/** Call duration bounds for the in-call timer (FR-15). Default 10 min when no scenario. */
export const MIN_CALL_MINUTES = 1;
export const MAX_CALL_MINUTES = 60;
export const DEFAULT_CALL_MINUTES = 10;
/** Soft warning fires this many seconds before the timer ends (FR-15). */
export const CALL_WARNING_SECONDS = 60;

/** Create a new session (host picks video on/off + duration). */
export const createSessionInputSchema = z.object({
  // Audio is always recorded (mandatory for scoring); video is opt-in to control
  // recording-storage cost (PRD + cost doc) — default OFF.
  videoEnabled: z.boolean().default(false),
  durationMinutes: z
    .number()
    .int()
    .min(MIN_CALL_MINUTES)
    .max(MAX_CALL_MINUTES)
    .default(DEFAULT_CALL_MINUTES),
});
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

/** Reference an existing session by id (cuid). */
export const sessionIdInputSchema = z.object({ sessionId: z.string().min(1) });
export type SessionIdInput = z.infer<typeof sessionIdInputSchema>;

/**
 * Recording consent (FR-18). Bump CONSENT_VERSION whenever the text changes; a user
 * must re-accept. Stored per (user, version) in the RecordingConsent table.
 */
export const CONSENT_VERSION = "2026-06-07";
export const CONSENT_TEXT =
  "This call will be recorded (audio, and video if enabled) so it can be reviewed and, " +
  "in a later release, scored. Recordings are private to you by default and stored securely. " +
  "By continuing, both participants consent to being recorded.";

export const acceptConsentInputSchema = z.object({ version: z.string().min(1) });
export type AcceptConsentInput = z.infer<typeof acceptConsentInputSchema>;

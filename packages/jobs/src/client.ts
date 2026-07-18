import { Inngest, eventType, staticSchema } from "inngest";

/**
 * Inngest client + typed event definitions for the Sales Roleplay async pipeline
 * (PRD §9.5, DevOps handover §9). Inngest v4 types events via `eventType` +
 * `staticSchema` (type-only, no runtime validation library); the definitions double as
 * function triggers. The SDK reads INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY from the
 * environment in deployed environments; locally `npx inngest-cli dev` needs neither.
 */

/** Emitted by the LiveKit webhook once a recording is READY. Kicks off scoring. */
export const sessionEndedEvent = eventType("session/ended", {
  schema: staticSchema<{ sessionId: string }>(),
});

/** Emitted after a Score is persisted; the seam for the Phase 6 notification fan-out. */
export const scoreCreatedEvent = eventType("score/created", {
  schema: staticSchema<{ sessionId: string; subjectUserId: string; scoreId: string }>(),
});

/** Emitted when a match is created; arms the durable no-show timer (FR-12). */
export const matchCreatedEvent = eventType("match/created", {
  schema: staticSchema<{ sessionId: string }>(),
});

export const inngest = new Inngest({ id: "sales-roleplay" });

import type { InngestFunction } from "inngest";
import { scoreSession } from "./functions/score-session";
import { matchNoShow } from "./functions/match-no-show";

export {
  inngest,
  sessionEndedEvent,
  scoreCreatedEvent,
  matchCreatedEvent,
} from "./client";

/** Redis client + matchmaking API, re-exported so the web app has one import surface. */
export { redis } from "./redis";
export {
  joinAndPair,
  leaveMatch,
  resolveNoShow,
  readQueueState,
  dequeue,
  heartbeat,
  assignRoles,
  type JoinInput,
  type JoinResult,
} from "./matchmaking";

/**
 * All Inngest functions, registered with the serve handler at /api/inngest. Inngest
 * auto-discovers them on deploy (DevOps handover §5).
 */
export const functions: InngestFunction.Any[] = [scoreSession, matchNoShow];

export { scoreSession, matchNoShow };

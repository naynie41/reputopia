import type { InngestFunction } from "inngest";
import { scoreSession } from "./functions/score-session";

export { inngest, sessionEndedEvent, scoreCreatedEvent } from "./client";

/**
 * All Inngest functions, registered with the serve handler at /api/inngest. Inngest
 * auto-discovers them on deploy (DevOps handover §5). Phase 2 has the scoring pipeline;
 * the `score/created` event it emits is the seam for the Phase 6 notification fan-out.
 */
export const functions: InngestFunction.Any[] = [scoreSession];

export { scoreSession };

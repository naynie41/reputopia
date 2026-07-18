import type { InngestFunction } from "inngest";
import { prisma } from "@sr/db";
import { NO_SHOW_TIMEOUT_SECONDS } from "@sr/core";
import { inngest, matchCreatedEvent } from "../client";
import { redis } from "../redis";
import { resolveNoShow } from "../matchmaking";

/**
 * No-show / abandon safety net (PRD FR-12), armed by `match/created`. Uses Inngest's
 * durable delay: it sleeps N seconds — surviving restarts, no background loop — then
 * checks the match. If the call already started or both participants readied, it's a
 * no-op (idempotent). Otherwise `resolveNoShow` cancels the match, re-queues whoever
 * readied, and records a no-show for whoever didn't.
 */
export const matchNoShow: InngestFunction.Any = inngest.createFunction(
  { id: "match-no-show", triggers: [matchCreatedEvent], retries: 3 },
  async ({ event, step }) => {
    const { sessionId } = event.data;

    // Durable delay — Inngest persists this wait across deploys/restarts.
    await step.sleep("wait-for-ready", `${NO_SHOW_TIMEOUT_SECONDS}s`);

    return step.run("resolve-no-show", () => resolveNoShow(redis, prisma, sessionId));
  },
);

import "server-only";
import { Redis } from "@upstash/redis";
import { serverEnv } from "@sr/config/env.server";

/**
 * Upstash Redis client (REST-based, serverless-friendly) for the matchmaking queue.
 * Constructed from the validated env; a single instance is fine because the REST client
 * is stateless (no connection pool to exhaust).
 */
export const redis = new Redis({
  url: serverEnv.UPSTASH_REDIS_REST_URL,
  token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
});

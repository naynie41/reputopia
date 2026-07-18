import { Redis } from "@upstash/redis";
import { serverEnv } from "@sr/config/env.server";

/**
 * Upstash Redis client (REST-based) for the matchmaking queue. Shared by the tRPC layer
 * (via re-export from @sr/jobs) and the durable no-show job. Stateless REST, so a single
 * instance is fine.
 */
export const redis = new Redis({
  url: serverEnv.UPSTASH_REDIS_REST_URL,
  token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
});

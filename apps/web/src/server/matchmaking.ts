import type { Redis } from "@upstash/redis";
import { QUEUE_ENTRY_TTL_SECONDS, type PreferredRole, type Track } from "@sr/core";

/**
 * Matchmaking queue backed by Upstash Redis (PRD §5.3). This module holds only the queue
 * mechanics — join, leave, heartbeat; the atomic pairing (find a compatible waiting user)
 * lands in the next step. The Redis client is passed in so the logic is unit-testable
 * against a fake without real Upstash creds.
 *
 * Structures (keyed by track for efficient compatible-user lookup — scenario + role live
 * on the entry so pairing can filter):
 *   mm:q:{track}    ZSET  member=userId, score=enqueuedAtMs   — the ordered waiting pool
 *   mm:req:{userId} HASH  {userId, track, scenarioId, preferredRole, enqueuedAt}  (TTL)
 *   mm:user:{userId} STR  = track  — pointer so leave/heartbeat don't need the track (TTL)
 *
 * Staleness (closed tabs): the req hash + pointer carry a TTL refreshed by the client's
 * heartbeat. If heartbeats stop, both expire; the leftover ZSET member (which can't carry
 * its own TTL) is swept lazily — here on enqueue, and at pairing time — so it can't create
 * a ghost match.
 */

const TTL = QUEUE_ENTRY_TTL_SECONDS;

const queueKey = (track: Track) => `mm:q:${track}`;
const reqKey = (userId: string) => `mm:req:${userId}`;
const userKey = (userId: string) => `mm:user:${userId}`;

export interface QueueEntryInput {
  userId: string;
  track: Track;
  scenarioId?: string; // undefined = any in track
  preferredRole: PreferredRole;
}

/** Remove any existing Redis presence for a user (idempotent; used by leave + re-join). */
async function clearPresence(redis: Redis, userId: string): Promise<void> {
  const track = await redis.get<string>(userKey(userId));
  if (track) await redis.zrem(queueKey(track as Track), userId);
  await redis.del(reqKey(userId), userKey(userId));
}

/** Sweep queue members whose req hash has expired (stale closed tabs) — no ghost matches. */
export async function evictStale(redis: Redis, track: Track): Promise<void> {
  const members = await redis.zrange<string[]>(queueKey(track), 0, -1);
  for (const userId of members) {
    if ((await redis.exists(reqKey(userId))) === 0) {
      await redis.zrem(queueKey(track), userId);
    }
  }
}

/** Add (or refresh) a user's queue entry. Re-joining first clears any prior presence. */
export async function enqueue(redis: Redis, entry: QueueEntryInput): Promise<void> {
  await clearPresence(redis, entry.userId);
  const now = Date.now();
  await redis.zadd(queueKey(entry.track), { score: now, member: entry.userId });
  await redis.hset(reqKey(entry.userId), {
    userId: entry.userId,
    track: entry.track,
    scenarioId: entry.scenarioId ?? "",
    preferredRole: entry.preferredRole,
    enqueuedAt: now,
  });
  await redis.expire(reqKey(entry.userId), TTL);
  await redis.set(userKey(entry.userId), entry.track, { ex: TTL });
  await evictStale(redis, entry.track);
}

/** Remove a user from the queue entirely. */
export async function dequeue(redis: Redis, userId: string): Promise<void> {
  await clearPresence(redis, userId);
}

/**
 * Refresh a user's queue TTLs (called on the client's interval). Returns false if the
 * user is no longer in the queue (expired or never joined). Re-asserts the ZSET member
 * with `nx` so its original enqueue order (fairness) is preserved.
 */
export async function heartbeat(redis: Redis, userId: string): Promise<boolean> {
  const track = await redis.get<string>(userKey(userId));
  if (!track) return false;

  const req = await redis.hgetall<{ enqueuedAt?: string | number }>(reqKey(userId));
  if (!req) {
    await clearPresence(redis, userId);
    return false;
  }

  await redis.expire(reqKey(userId), TTL);
  await redis.set(userKey(userId), track, { ex: TTL });
  const enqueuedAt = Number(req.enqueuedAt) || Date.now();
  await redis.zadd(queueKey(track as Track), { nx: true }, { score: enqueuedAt, member: userId });
  return true;
}

/** Current number of waiting users in a track's queue (diagnostics / UI). */
export async function queueSize(redis: Redis, track: Track): Promise<number> {
  return redis.zcard(queueKey(track));
}

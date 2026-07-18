import { randomUUID } from "node:crypto";
import type { Redis } from "@upstash/redis";
import type { PrismaClient } from "@sr/db";
import {
  DIFFICULTY_BAND,
  LEVEL_BAND,
  QUEUE_ENTRY_TTL_SECONDS,
  RECENT_MATCH_TTL_SECONDS,
  experienceLevelToRank,
  type PreferredRole,
  type Track,
} from "@sr/core";
import { inngest } from "./client";

/**
 * Matchmaking queue + atomic pairing (PRD §5.3). Pairing happens ON ENQUEUE: a single
 * Redis Lua script (KEYS[1] = the track queue) either finds a compatible waiting user and
 * removes them, or enqueues the joiner — atomically, because Redis runs the whole script
 * without interleaving. That is what makes two simultaneous joins race-safe: they're
 * serialized, so the same waiting user can never be handed to two joiners.
 *
 * Lives in @sr/jobs because both the tRPC layer (join/leave/status) and the durable
 * no-show job need it. The Redis client is passed in so the logic is unit-testable.
 *
 * Structures:
 *   mm:q:{track}          ZSET  member=userId, score=enqueuedAtMs (FIFO scan pool)
 *   mm:req:{userId}       HASH  {userId, track, scenarioId, preferredRole, enqueuedAt, level, difficulty}  (TTL)
 *   mm:user:{userId}      STR   = track           (pointer; TTL — refreshed by heartbeat)
 *   mm:user:{userId}:match STR  = sessionId       (set the instant a waiting user is matched)
 *   mm:recent:{a}:{b}     STR   = 1               (TTL — "not recently matched", canonical a<b)
 */

const TTL = QUEUE_ENTRY_TTL_SECONDS;

const queueKey = (track: Track) => `mm:q:${track}`;
const reqKey = (userId: string) => `mm:req:${userId}`;
const userKey = (userId: string) => `mm:user:${userId}`;
const matchKey = (userId: string) => `mm:user:${userId}:match`;

// ---------------------------------------------------------------------------
// Atomic pair-or-enqueue (Lua)
// ---------------------------------------------------------------------------

/**
 * Scans the track queue oldest-first for a compatible waiting user (PRD FR-10):
 * complementary roles, same-or-"any" scenario, similar level + difficulty, not recently
 * matched. On a match it removes the candidate, marks the pair as recently matched, and
 * points the candidate at the session. On no match it enqueues the joiner. Ghost entries
 * (req hash expired) are swept during the scan.
 */
const PAIR_SCRIPT = `
local queueKey = KEYS[1]
local joiner = ARGV[1]
local jScenario = ARGV[2]
local jRole = ARGV[3]
local jLevel = tonumber(ARGV[4])
local jDiff = tonumber(ARGV[5])
local now = tonumber(ARGV[6])
local ttl = tonumber(ARGV[7])
local levelBand = tonumber(ARGV[8])
local diffBand = tonumber(ARGV[9])
local recentTtl = tonumber(ARGV[10])
local sessionId = ARGV[11]
local track = ARGV[12]
local jReqKey = 'mm:req:' .. joiner

local members = redis.call('ZRANGE', queueKey, 0, 49)
for _, cand in ipairs(members) do
  if cand ~= joiner then
    local reqKey = 'mm:req:' .. cand
    local flat = redis.call('HGETALL', reqKey)
    if #flat == 0 then
      redis.call('ZREM', queueKey, cand)
    else
      local h = {}
      for k = 1, #flat, 2 do h[flat[k]] = flat[k + 1] end
      local cRole = h['preferredRole']
      local cScenario = h['scenarioId']
      if cScenario == nil then cScenario = '' end
      local cLevel = tonumber(h['level'])
      local cDiff = tonumber(h['difficulty'])
      if cDiff == nil then cDiff = 0 end

      local rolesOk = not (jRole == cRole and jRole ~= 'EITHER')
      local scenOk = (jScenario == '' or cScenario == '' or jScenario == cScenario)
      local levelOk = (jLevel < 0 or cLevel == nil or math.abs(jLevel - cLevel) <= levelBand)
      local diffOk = (jDiff == 0 or cDiff == 0 or math.abs(jDiff - cDiff) <= diffBand)

      local a = joiner
      local b = cand
      if a > b then a = cand; b = joiner end
      local recentKey = 'mm:recent:' .. a .. ':' .. b
      local recentOk = (redis.call('EXISTS', recentKey) == 0)

      if rolesOk and scenOk and levelOk and diffOk and recentOk then
        redis.call('ZREM', queueKey, cand)
        redis.call('DEL', reqKey, 'mm:user:' .. cand)
        redis.call('SET', recentKey, '1', 'EX', recentTtl)
        redis.call('SET', 'mm:user:' .. cand .. ':match', sessionId, 'EX', recentTtl)
        return { 'MATCHED', cand, cRole, cScenario }
      end
    end
  end
end

redis.call('ZADD', queueKey, now, joiner)
redis.call('HSET', jReqKey, 'userId', joiner, 'track', track, 'scenarioId', jScenario,
  'preferredRole', jRole, 'enqueuedAt', now, 'level', ARGV[4], 'difficulty', ARGV[5])
redis.call('EXPIRE', jReqKey, ttl)
redis.call('SET', 'mm:user:' .. joiner, track, 'EX', ttl)
return { 'WAITING' }
`;

interface PairArgs {
  userId: string;
  track: Track;
  scenarioId?: string; // "" / undefined = any in track
  preferredRole: PreferredRole;
  level: number;
  difficulty: number; // 0 = any
  sessionId: string;
}

type PairResult =
  | { matched: false }
  | { matched: true; candidateId: string; candidateRole: PreferredRole; candidateScenarioId: string };

async function pairOrEnqueue(redis: Redis, args: PairArgs): Promise<PairResult> {
  const res = (await redis.eval(
    PAIR_SCRIPT,
    [queueKey(args.track)],
    [
      args.userId,
      args.scenarioId ?? "",
      args.preferredRole,
      String(args.level),
      String(args.difficulty),
      String(Date.now()),
      String(TTL),
      String(LEVEL_BAND),
      String(DIFFICULTY_BAND),
      String(RECENT_MATCH_TTL_SECONDS),
      args.sessionId,
      args.track,
    ],
  )) as string[];

  if (res[0] === "MATCHED") {
    return {
      matched: true,
      candidateId: res[1]!,
      candidateRole: res[2] as PreferredRole,
      candidateScenarioId: res[3] ?? "",
    };
  }
  return { matched: false };
}

/** Resolve who is seller vs counterpart from the two preferred roles. */
export function assignRoles(
  joinerId: string,
  joinerRole: PreferredRole,
  candidateId: string,
  candidateRole: PreferredRole,
): { sellerId: string; counterpartId: string } {
  if (joinerRole === "SELLER") return { sellerId: joinerId, counterpartId: candidateId };
  if (joinerRole === "COUNTERPART") return { sellerId: candidateId, counterpartId: joinerId };
  // joiner is EITHER — defer to the candidate's preference; both EITHER → joiner sells.
  if (candidateRole === "SELLER") return { sellerId: candidateId, counterpartId: joinerId };
  return { sellerId: joinerId, counterpartId: candidateId };
}

// ---------------------------------------------------------------------------
// Full join operation (Redis pairing + DB Session/MatchRequest)
// ---------------------------------------------------------------------------

export interface JoinInput {
  userId: string;
  experienceLevel: string | null;
  track: Track;
  scenarioId?: string; // undefined = any in track
  preferredRole: PreferredRole;
}

export type JoinResult =
  | { status: "WAITING" }
  | { status: "MATCHED"; sessionId: string; role: "seller" | "counterpart" };

/**
 * Join the queue and pair atomically. On a match, creates the Session (reusing the Phase 1
 * model), flips both MatchRequests to MATCHED, points the waiting user at the session, and
 * emits `match/created` to arm the durable no-show timer. On no match, records WAITING.
 */
export async function joinAndPair(
  redis: Redis,
  prisma: PrismaClient,
  input: JoinInput,
): Promise<JoinResult> {
  // Supersede any prior WAITING request + clear any prior Redis presence (re-join).
  await prisma.matchRequest.updateMany({
    where: { userId: input.userId, status: "WAITING" },
    data: { status: "CANCELED" },
  });
  await clearPresence(redis, input.userId);

  const level = experienceLevelToRank(input.experienceLevel);
  const difficulty = input.scenarioId
    ? ((await prisma.scenario.findUnique({ where: { id: input.scenarioId } }))?.difficulty ?? 0)
    : 0;

  const sessionId = randomUUID();
  const result = await pairOrEnqueue(redis, {
    userId: input.userId,
    track: input.track,
    scenarioId: input.scenarioId,
    preferredRole: input.preferredRole,
    level,
    difficulty,
    sessionId,
  });

  if (!result.matched) {
    await prisma.matchRequest.create({
      data: {
        userId: input.userId,
        track: input.track,
        scenarioId: input.scenarioId ?? null,
        preferredRole: input.preferredRole,
        status: "WAITING",
      },
    });
    return { status: "WAITING" };
  }

  // Matched — choose the scenario (agreed one, else any active in the track).
  const chosenId = input.scenarioId || result.candidateScenarioId || null;
  const scenario = chosenId
    ? await prisma.scenario.findUnique({ where: { id: chosenId } })
    : await prisma.scenario.findFirst({
        where: { track: input.track, active: true },
        orderBy: { difficulty: "asc" },
      });
  if (!scenario) {
    // No scenario to run — treat as waiting rather than creating a broken session.
    await prisma.matchRequest.create({
      data: {
        userId: input.userId,
        track: input.track,
        scenarioId: input.scenarioId ?? null,
        preferredRole: input.preferredRole,
        status: "WAITING",
      },
    });
    return { status: "WAITING" };
  }

  const { sellerId, counterpartId } = assignRoles(
    input.userId,
    input.preferredRole,
    result.candidateId,
    result.candidateRole,
  );

  await prisma.session.create({
    data: {
      id: sessionId,
      roomId: `sr_${randomUUID()}`,
      sellerId,
      counterpartId,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      durationMinutes: Math.max(1, Math.round(scenario.durationS / 60)),
      videoEnabled: false,
      status: "PENDING",
    },
  });

  // Point the joiner at the session too (symmetry) + flip both durable requests.
  await redis.set(matchKey(input.userId), sessionId, { ex: RECENT_MATCH_TTL_SECONDS });
  await prisma.matchRequest.create({
    data: {
      userId: input.userId,
      track: input.track,
      scenarioId: scenario.id,
      preferredRole: input.preferredRole,
      status: "MATCHED",
    },
  });
  await prisma.matchRequest.updateMany({
    where: { userId: result.candidateId, status: "WAITING" },
    data: { status: "MATCHED" },
  });

  // Arm the durable no-show timer. Best-effort: a failed emit (e.g. no local Inngest dev
  // server) must not fail the match itself. Event id dedupes redelivery.
  try {
    await inngest.send({ id: `match-created-${sessionId}`, name: "match/created", data: { sessionId } });
  } catch {
    // no-op — the no-show safety net is unavailable, but the match is valid.
  }

  return { status: "MATCHED", sessionId, role: sellerId === input.userId ? "seller" : "counterpart" };
}

// ---------------------------------------------------------------------------
// Abandon / no-show resolution (FR-12)
// ---------------------------------------------------------------------------

/** Re-queue a user with their most recent preferences (used by no-show / leave). */
async function requeueUser(redis: Redis, prisma: PrismaClient, userId: string): Promise<void> {
  const req = await prisma.matchRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { track: true, scenarioId: true, preferredRole: true },
  });
  if (!req) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { experienceLevel: true },
  });
  await joinAndPair(redis, prisma, {
    userId,
    experienceLevel: user?.experienceLevel ?? null,
    track: req.track,
    scenarioId: req.scenarioId ?? undefined,
    preferredRole: req.preferredRole,
  });
}

/**
 * Atomically cancel a still-PENDING match, then no-show + re-queue. The updateMany guard
 * makes it idempotent: only the first caller that flips PENDING→CANCELED proceeds, so a
 * racing timeout + explicit-leave — or a call that already started (status LIVE) — is a
 * safe no-op.
 */
async function cancelAndResolve(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  requeueIds: string[],
  noShowIds: string[],
): Promise<boolean> {
  const cancel = await prisma.session.updateMany({
    where: { id: sessionId, status: "PENDING" },
    data: { status: "CANCELED" },
  });
  if (cancel.count === 0) return false; // already started / resolved

  // Clear stale match pointers so no one is routed back to the canceled session.
  for (const id of [...requeueIds, ...noShowIds]) await redis.del(matchKey(id));
  for (const id of noShowIds) {
    await prisma.user.update({ where: { id }, data: { noShowCount: { increment: 1 } } });
  }
  for (const id of requeueIds) await requeueUser(redis, prisma, id);
  return true;
}

/**
 * No-show timeout resolution (FR-12), called after the durable delay. No-op if the call
 * already started or both readied; otherwise cancels the match, re-queues whoever readied,
 * and records a no-show for whoever didn't.
 */
export async function resolveNoShow(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
): Promise<{ canceled: boolean; requeued: string[]; noShow: string[] }> {
  const none = { canceled: false, requeued: [] as string[], noShow: [] as string[] };
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      sellerId: true,
      counterpartId: true,
      sellerReady: true,
      counterpartReady: true,
    },
  });
  if (!s || s.status !== "PENDING") return none; // started / ended / already canceled
  if (s.sellerReady && s.counterpartReady) return none; // both showed

  const requeue: string[] = [];
  const noShow: string[] = [];
  (s.sellerReady ? requeue : noShow).push(s.sellerId);
  if (s.counterpartId) (s.counterpartReady ? requeue : noShow).push(s.counterpartId);

  const did = await cancelAndResolve(redis, prisma, sessionId, requeue, noShow);
  return did ? { canceled: true, requeued: requeue, noShow } : none;
}

/**
 * Explicit lobby leave (FR-12): the leaver is treated as a no-show; the other participant
 * is re-queued so they don't lose their place. The caller must have authorized `leaverId`
 * as a participant. Idempotent + a no-op once the call has started.
 */
export async function leaveMatch(
  redis: Redis,
  prisma: PrismaClient,
  sessionId: string,
  leaverId: string,
): Promise<boolean> {
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { status: true, sellerId: true, counterpartId: true },
  });
  if (!s || s.status !== "PENDING") return false;
  if (s.sellerId !== leaverId && s.counterpartId !== leaverId) return false;
  const other = s.sellerId === leaverId ? s.counterpartId : s.sellerId;
  return cancelAndResolve(redis, prisma, sessionId, other ? [other] : [], [leaverId]);
}

/**
 * Read a user's queue state for polling (getQueueStatus). Returns the match session id if
 * they've been paired, else whether they're still queued.
 */
export async function readQueueState(
  redis: Redis,
  userId: string,
): Promise<{ matchSessionId: string | null; queued: boolean }> {
  const matchSessionId = await redis.get<string>(matchKey(userId));
  const queued = (await redis.get<string>(userKey(userId))) !== null;
  return { matchSessionId, queued };
}

// ---------------------------------------------------------------------------
// Queue primitives (also used by unit tests)
// ---------------------------------------------------------------------------

export interface QueueEntryInput {
  userId: string;
  track: Track;
  scenarioId?: string;
  preferredRole: PreferredRole;
  level?: number;
  difficulty?: number;
}

/** Remove any existing Redis presence for a user (idempotent). */
export async function clearPresence(redis: Redis, userId: string): Promise<void> {
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

/** Non-atomic enqueue primitive (the atomic path is the Lua above; used by tests/setup). */
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
    level: entry.level ?? -1,
    difficulty: entry.difficulty ?? 0,
  });
  await redis.expire(reqKey(entry.userId), TTL);
  await redis.set(userKey(entry.userId), entry.track, { ex: TTL });
  await evictStale(redis, entry.track);
}

/** Remove a user from the queue entirely (leave). */
export async function dequeue(redis: Redis, userId: string): Promise<void> {
  await clearPresence(redis, userId);
  await redis.del(matchKey(userId));
}

/** Refresh a user's queue TTLs. Returns false if no longer queued. */
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

/** Current number of waiting users in a track's queue. */
export async function queueSize(redis: Redis, track: Track): Promise<number> {
  return redis.zcard(queueKey(track));
}

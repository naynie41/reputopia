import { describe, expect, it, beforeEach } from "vitest";
import type { Redis } from "@upstash/redis";
import { assignRoles, dequeue, enqueue, evictStale, heartbeat, queueSize } from "./matchmaking";

/**
 * In-memory fake of the handful of Upstash Redis commands the queue uses, so the
 * join/leave/heartbeat logic is verifiable without real creds. Not a full Redis — just
 * enough: zset (member→score), hashes, and strings, with del/exists across all three.
 */
class FakeRedis {
  zsets = new Map<string, Map<string, number>>();
  hashes = new Map<string, Record<string, unknown>>();
  strings = new Map<string, unknown>();

  private zset(key: string) {
    let z = this.zsets.get(key);
    if (!z) this.zsets.set(key, (z = new Map()));
    return z;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async zadd(key: string, a: any, b?: any) {
    const isOpts = b !== undefined && !("member" in a);
    const sm = isOpts ? b : a;
    const nx = isOpts && a?.nx === true;
    const z = this.zset(key);
    if (nx && z.has(sm.member)) return 0;
    const isNew = !z.has(sm.member);
    z.set(sm.member, sm.score);
    return isNew ? 1 : 0;
  }
  async zrem(key: string, ...members: string[]) {
    const z = this.zsets.get(key);
    let n = 0;
    for (const m of members) if (z?.delete(m)) n++;
    return n;
  }
  async zrange<T extends unknown[]>(key: string): Promise<T> {
    const z = this.zsets.get(key);
    if (!z) return [] as unknown as T;
    return [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m) as unknown as T;
  }
  async zcard(key: string) {
    return this.zsets.get(key)?.size ?? 0;
  }
  async hset(key: string, kv: Record<string, unknown>) {
    this.hashes.set(key, { ...(this.hashes.get(key) ?? {}), ...kv });
    return Object.keys(kv).length;
  }
  async hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null> {
    return (this.hashes.get(key) as T) ?? null;
  }
  async set(key: string, value: unknown) {
    this.strings.set(key, value);
    return "OK" as const;
  }
  async get<T>(key: string): Promise<T | null> {
    return (this.strings.get(key) as T) ?? null;
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) {
      const had = this.hashes.delete(k) || this.strings.delete(k) || this.zsets.delete(k);
      if (had) n++;
    }
    return n;
  }
  async exists(...keys: string[]) {
    return keys.filter((k) => this.hashes.has(k) || this.strings.has(k) || this.zsets.has(k))
      .length;
  }
  async expire() {
    return 1 as const;
  }
}

const entry = {
  userId: "u1",
  track: "DISCOVERY" as const,
  scenarioId: "scn_1",
  preferredRole: "SELLER" as const,
};

describe("matchmaking queue", () => {
  let redis: Redis;
  let raw: FakeRedis;
  beforeEach(() => {
    raw = new FakeRedis();
    redis = raw as unknown as Redis;
  });

  it("enqueue adds the user to the track queue, entry hash, and pointer", async () => {
    await enqueue(redis, entry);
    expect(await queueSize(redis, "DISCOVERY")).toBe(1);
    expect(raw.hashes.get("mm:req:u1")).toMatchObject({
      userId: "u1",
      track: "DISCOVERY",
      scenarioId: "scn_1",
      preferredRole: "SELLER",
    });
    expect(raw.strings.get("mm:user:u1")).toBe("DISCOVERY");
  });

  it("stores empty scenarioId for 'any in track'", async () => {
    await enqueue(redis, { ...entry, scenarioId: undefined });
    expect(raw.hashes.get("mm:req:u1")).toMatchObject({ scenarioId: "" });
  });

  it("dequeue removes the user from the queue and clears its keys", async () => {
    await enqueue(redis, entry);
    await dequeue(redis, "u1");
    expect(await queueSize(redis, "DISCOVERY")).toBe(0);
    expect(raw.hashes.get("mm:req:u1")).toBeUndefined();
    expect(raw.strings.get("mm:user:u1")).toBeUndefined();
  });

  it("re-joining does not create a duplicate queue member", async () => {
    await enqueue(redis, entry);
    await enqueue(redis, { ...entry, track: "CLOSING", scenarioId: undefined });
    // moved out of the old track's queue, single entry in the new one
    expect(await queueSize(redis, "DISCOVERY")).toBe(0);
    expect(await queueSize(redis, "CLOSING")).toBe(1);
    expect(raw.strings.get("mm:user:u1")).toBe("CLOSING");
  });

  it("heartbeat returns true while queued and false once the entry has expired", async () => {
    await enqueue(redis, entry);
    expect(await heartbeat(redis, "u1")).toBe(true);
    // Simulate TTL expiry of the pointer (closed tab, no heartbeat).
    raw.strings.delete("mm:user:u1");
    expect(await heartbeat(redis, "u1")).toBe(false);
  });

  it("evictStale sweeps a ghost queue member whose entry hash has expired", async () => {
    await enqueue(redis, entry);
    // Simulate the req hash expiring but the zset member lingering.
    raw.hashes.delete("mm:req:u1");
    await evictStale(redis, "DISCOVERY");
    expect(await queueSize(redis, "DISCOVERY")).toBe(0);
  });
});

describe("assignRoles (complementary role resolution)", () => {
  it("honors an explicit seller/counterpart preference", () => {
    expect(assignRoles("j", "SELLER", "c", "COUNTERPART")).toEqual({ sellerId: "j", counterpartId: "c" });
    expect(assignRoles("j", "COUNTERPART", "c", "SELLER")).toEqual({ sellerId: "c", counterpartId: "j" });
  });

  it("lets an EITHER joiner take the seat the candidate doesn't want", () => {
    expect(assignRoles("j", "EITHER", "c", "SELLER")).toEqual({ sellerId: "c", counterpartId: "j" });
    expect(assignRoles("j", "EITHER", "c", "COUNTERPART")).toEqual({ sellerId: "j", counterpartId: "c" });
  });

  it("assigns arbitrarily but validly when both are EITHER", () => {
    const roles = assignRoles("j", "EITHER", "c", "EITHER");
    expect(new Set([roles.sellerId, roles.counterpartId])).toEqual(new Set(["j", "c"]));
  });
});

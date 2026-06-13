import { describe, expect, it } from "vitest";
import {
  computePerSpeakerMetrics,
  scoreDeterministicDimensions,
  selectSellerMetrics,
  type DiarizedTranscript,
} from "./metrics";

// Seller (A) talks ~half the time at a clean pace; counterpart (B) the rest.
const transcript: DiarizedTranscript = {
  duration_s: 60,
  speakers: ["A", "B"],
  turns: [
    // A: 10s, ~26 words -> 156 wpm, 1 filler ("um")
    { speaker: "A", text: "um so tell me a little about how your team handles outbound prospecting today and what is working", start_s: 0, end_s: 10 },
    // B: 10s
    { speaker: "B", text: "we mostly do cold email and it is not converting very well at all honestly", start_s: 10, end_s: 20 },
    // A: 10s
    { speaker: "A", text: "got it and when a prospect does reply what usually happens next in your current process", start_s: 20, end_s: 30 },
    // B: 10s
    { speaker: "B", text: "a rep follows up but they are slow so leads go cold before anyone calls them back", start_s: 30, end_s: 40 },
  ],
};

describe("computePerSpeakerMetrics", () => {
  const m = computePerSpeakerMetrics(transcript);

  it("computes talk share per speaker", () => {
    expect(m.A!.talk_seconds).toBe(20);
    expect(m.B!.talk_seconds).toBe(20);
    expect(m.A!.talk_pct).toBeCloseTo(50, 5);
    expect(m.B!.talk_pct).toBeCloseTo(50, 5);
  });

  it("computes wpm from words over talk minutes", () => {
    // A says ~33 words in 20s = 0.333 min -> ~99 wpm
    expect(m.A!.wpm).toBeGreaterThan(80);
    expect(m.A!.wpm).toBeLessThan(120);
  });

  it("counts filler words (word-boundary safe)", () => {
    // A: one "um". "prospecting" must NOT match "er"/"ah" etc.
    expect(m.A!.filler_per_min).toBeGreaterThan(0);
  });

  it("measures the longest contiguous monologue, merging consecutive same-speaker turns", () => {
    const monologue: DiarizedTranscript = {
      duration_s: 40,
      speakers: ["A", "B"],
      turns: [
        { speaker: "A", text: "one", start_s: 0, end_s: 10 },
        { speaker: "A", text: "two", start_s: 10, end_s: 25 }, // contiguous A run: 0..25 = 25s
        { speaker: "B", text: "ok", start_s: 25, end_s: 30 },
        { speaker: "A", text: "three", start_s: 30, end_s: 40 }, // 10s
      ],
    };
    const mm = computePerSpeakerMetrics(monologue);
    expect(mm.A!.longest_monologue_s).toBe(25);
  });
});

describe("selectSellerMetrics", () => {
  const per = computePerSpeakerMetrics(transcript);

  it("selects the named seller speaker", () => {
    const sel = selectSellerMetrics(per, "A");
    expect(sel.seller_talk_pct).toBeCloseTo(50, 1);
  });

  it("falls back to the most-talkative speaker when seller is unknown", () => {
    const lopsided = computePerSpeakerMetrics({
      duration_s: 30,
      speakers: ["A", "B"],
      turns: [
        { speaker: "A", text: "a lot of talking here from speaker a", start_s: 0, end_s: 25 },
        { speaker: "B", text: "short", start_s: 25, end_s: 30 },
      ],
    });
    const sel = selectSellerMetrics(lopsided, undefined);
    expect(sel.seller_talk_pct).toBeGreaterThan(50);
  });

  it("returns zeros for an empty transcript", () => {
    expect(selectSellerMetrics({}, "A")).toEqual({
      seller_talk_pct: 0,
      filler_per_min: 0,
      wpm: 0,
      longest_monologue_s: 0,
    });
  });
});

describe("scoreDeterministicDimensions", () => {
  it("rewards a balanced talk ratio and clean pace", () => {
    const dims = scoreDeterministicDimensions({
      seller_talk_pct: 48,
      filler_per_min: 0,
      wpm: 140,
      longest_monologue_s: 20,
    });
    const talk = dims.find((d) => d.key === "talk_ratio")!;
    const filler = dims.find((d) => d.key === "filler_pace")!;
    expect(talk.score).toBe(100);
    expect(filler.score).toBe(100);
  });

  it("penalizes monologuing and heavy filler", () => {
    const dims = scoreDeterministicDimensions({
      seller_talk_pct: 85,
      filler_per_min: 12,
      wpm: 220,
      longest_monologue_s: 240,
    });
    const talk = dims.find((d) => d.key === "talk_ratio")!;
    const filler = dims.find((d) => d.key === "filler_pace")!;
    expect(talk.score).toBeLessThan(40);
    expect(filler.score).toBeLessThan(40);
  });

  it("clamps all scores into 0–100", () => {
    const dims = scoreDeterministicDimensions({
      seller_talk_pct: 100,
      filler_per_min: 100,
      wpm: 1000,
      longest_monologue_s: 1000,
    });
    for (const d of dims) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
  });
});

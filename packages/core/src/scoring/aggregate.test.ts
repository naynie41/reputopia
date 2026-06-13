import { describe, expect, it } from "vitest";
import { aggregate, foldIntoSkillProfile } from "./aggregate";
import { scoringResponseSchema, type ScoringResponse } from "./contract";
import type { DeterministicMetrics } from "./contract";

const metrics: DeterministicMetrics = {
  seller_talk_pct: 48,
  filler_per_min: 0,
  wpm: 140,
  longest_monologue_s: 20,
};

const response: ScoringResponse = {
  seller_speaker: "A",
  dimensions: [
    { key: "discovery", score: 80, evidence: ["turn_0"], comment: "good questions" },
    { key: "objection", score: 60, evidence: ["turn_3"], comment: "" },
    { key: "dm_setting", score: 50, evidence: ["turn_1"], comment: "" },
    { key: "closing", score: 70, evidence: ["turn_4"], comment: "" },
    { key: "rapport", score: 90, evidence: ["turn_2"], comment: "" },
    { key: "communication", score: 75, evidence: ["turn_0"], comment: "" },
  ],
  strengths: ["asks layered questions"],
  growth_areas: ["ask for the next step sooner"],
  moments: [{ t_start_s: 0, t_end_s: 10, label: "good", dimension: "discovery", note: "strong open" }],
};

describe("aggregate", () => {
  const result = aggregate(response, metrics);

  it("merges LLM dimensions with the two deterministic dimensions", () => {
    expect(result.dimensions).toHaveLength(8);
    expect(result.dimensions.map((d) => d.key)).toContain("talk_ratio");
    expect(result.dimensions.map((d) => d.key)).toContain("filler_pace");
  });

  it("produces an overall in 0–100 reflecting the weighted mean", () => {
    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    // Hand weights are all present; clean deterministic dims (100) pull it up a touch.
    expect(result.overall).toBeGreaterThan(70);
    expect(result.overall).toBeLessThan(85);
  });

  it("maps the four track scores from their dimensions", () => {
    expect(result.track_scores.discovery).toBe(80);
    expect(result.track_scores.objection).toBe(60);
    expect(result.track_scores.dm_setting).toBe(50);
    expect(result.track_scores.closing).toBe(70);
  });

  it("normalizes by present weight when a dimension is omitted", () => {
    const partial: ScoringResponse = {
      ...response,
      dimensions: [{ key: "discovery", score: 80, evidence: [], comment: "" }],
    };
    const r = aggregate(partial, metrics);
    // discovery(80) + talk_ratio(100) + filler_pace(100), weights 0.18/0.05/0.05.
    // weighted = (80*.18 + 100*.05 + 100*.05) / 0.28 = (14.4+5+5)/0.28 ≈ 87
    expect(r.overall).toBeGreaterThan(80);
    expect(r.track_scores.objection).toBeNull();
  });
});

describe("foldIntoSkillProfile", () => {
  it("seeds the rolling average from a zeroed profile", () => {
    const next = foldIntoSkillProfile(
      { discovery: 0, objection: 0, dmSetting: 0, closing: 0, repsCount: 0 },
      { discovery: 80, objection: 60, dm_setting: 50, closing: 70 },
    );
    expect(next).toEqual({
      discovery: 80,
      objection: 60,
      dmSetting: 50,
      closing: 70,
      repsCount: 1,
    });
  });

  it("rolls a new sample into an existing average and increments reps", () => {
    const next = foldIntoSkillProfile(
      { discovery: 80, objection: 60, dmSetting: 50, closing: 70, repsCount: 1 },
      { discovery: 60, objection: 80, dm_setting: 70, closing: 50 },
    );
    expect(next.discovery).toBe(70); // (80*1 + 60)/2
    expect(next.repsCount).toBe(2);
  });

  it("leaves a track unchanged when this session has no score for it", () => {
    const next = foldIntoSkillProfile(
      { discovery: 80, objection: 60, dmSetting: 50, closing: 70, repsCount: 1 },
      { discovery: null, objection: null, dm_setting: null, closing: null },
    );
    expect(next.discovery).toBe(80);
    expect(next.repsCount).toBe(2);
  });
});

describe("scoringResponseSchema", () => {
  it("parses a valid model response", () => {
    expect(() => scoringResponseSchema.parse(response)).not.toThrow();
  });

  it("rejects an unknown dimension key", () => {
    const bad = {
      ...response,
      dimensions: [{ key: "made_up", score: 50, evidence: ["turn_0"], comment: "" }],
    };
    expect(() => scoringResponseSchema.parse(bad)).toThrow();
  });

  it("rejects a dimension score with no evidence (PRD §6.4 evidence required)", () => {
    const noEvidence = {
      ...response,
      dimensions: [{ key: "discovery", score: 80, evidence: [], comment: "" }],
    };
    expect(() => scoringResponseSchema.parse(noEvidence)).toThrow();
  });

  it("applies defaults for omitted optional arrays", () => {
    const parsed = scoringResponseSchema.parse({ seller_speaker: "A", dimensions: [] });
    expect(parsed.strengths).toEqual([]);
    expect(parsed.moments).toEqual([]);
  });
});

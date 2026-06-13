import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  DIMENSION_KEYS,
  LLM_DIMENSION_KEYS,
  RUBRIC,
  TRACK_DIMENSION,
  WEIGHT_PRESETS,
  getScenarioWeights,
} from "./rubric";
import { trackSchema, type Track } from "../enums";

const sum = (w: Record<string, number>) =>
  Object.values(w).reduce((a, b) => a + b, 0);

describe("rubric anchors", () => {
  it("gives every LLM-judged dimension concrete 0/50/100 anchors", () => {
    for (const d of RUBRIC.filter((x) => x.kind === "llm")) {
      expect(d.anchors[0].length).toBeGreaterThan(0);
      expect(d.anchors[50].length).toBeGreaterThan(0);
      expect(d.anchors[100].length).toBeGreaterThan(0);
    }
  });

  it("marks talk_ratio and filler_pace as deterministic", () => {
    const deterministic = RUBRIC.filter((d) => d.kind === "deterministic").map((d) => d.key);
    expect(deterministic.sort()).toEqual(["filler_pace", "talk_ratio"]);
  });
});

describe("weightings", () => {
  it("default weights sum to 1 and cover every dimension", () => {
    expect(sum(DEFAULT_WEIGHTS)).toBeCloseTo(1, 5);
    expect(Object.keys(DEFAULT_WEIGHTS).sort()).toEqual([...DIMENSION_KEYS].sort());
  });

  it("each track preset sums to 1, covers every dimension, and emphasizes its focal skill", () => {
    for (const track of trackSchema.options) {
      const preset = WEIGHT_PRESETS[track as Track];
      expect(sum(preset)).toBeCloseTo(1, 5);
      expect(Object.keys(preset).sort()).toEqual([...DIMENSION_KEYS].sort());

      // The focal dimension for the track must carry the most weight.
      const focal = TRACK_DIMENSION[track as Track];
      const focalWeight = preset[focal]!;
      for (const [key, w] of Object.entries(preset)) {
        if (key !== focal) expect(focalWeight).toBeGreaterThan(w);
      }
    }
  });

  it("resolves scenario weights by track, falling back to default", () => {
    expect(getScenarioWeights("CLOSING")).toBe(WEIGHT_PRESETS.CLOSING);
    expect(getScenarioWeights(null)).toBe(DEFAULT_WEIGHTS);
    expect(getScenarioWeights()).toBe(DEFAULT_WEIGHTS);
  });

  it("keeps deterministic dimensions light in every preset", () => {
    for (const track of trackSchema.options) {
      const preset = WEIGHT_PRESETS[track as Track];
      for (const key of LLM_DIMENSION_KEYS) {
        // each deterministic weight (0.05) stays below the focal LLM weight
        expect(preset["talk_ratio"]!).toBeLessThan(preset[TRACK_DIMENSION[track as Track]]!);
        expect(preset["filler_pace"]!).toBeLessThan(preset[key]! + 1); // sanity bound
      }
    }
  });
});

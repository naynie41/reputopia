import type { DeterministicMetrics, ScoredDimension, ScoreResult, ScoringResponse } from "./contract";
import { scoreDeterministicDimensions } from "./metrics";
import { DEFAULT_WEIGHTS, TRACK_DIMENSION } from "./rubric";

/**
 * Aggregate the LLM response + deterministic metrics into the persisted ScoreResult
 * (PRD §6.2 step 4): merge dimensions, apply weights → overall, map to the four track
 * scores. Pure function — no I/O.
 *
 * Phase 2 uses DEFAULT_WEIGHTS (no Scenario table). When per-scenario weighting lands
 * in Phase 3, pass a `weights` override.
 */
export function aggregate(
  response: ScoringResponse,
  metrics: DeterministicMetrics,
  weights: Readonly<Record<string, number>> = DEFAULT_WEIGHTS,
): ScoreResult {
  const llmDimensions: ScoredDimension[] = response.dimensions.map((d) => ({
    key: d.key,
    score: d.score,
    weight: weights[d.key] ?? 0,
    kind: "llm" as const,
    evidence: d.evidence,
    comment: d.comment,
  }));

  const dimensions: ScoredDimension[] = [
    ...llmDimensions,
    ...scoreDeterministicDimensions(metrics),
  ];

  // Weighted mean, normalized by the weight actually present (so a dimension the LLM
  // omitted doesn't silently drag the overall down).
  const weightSum = dimensions.reduce((s, d) => s + d.weight, 0);
  const overall =
    weightSum > 0
      ? Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0) / weightSum)
      : 0;

  const scoreFor = (dimKey: string): number | null =>
    dimensions.find((d) => d.key === dimKey)?.score ?? null;

  return {
    overall,
    dimensions,
    strengths: response.strengths,
    growth_areas: response.growth_areas,
    moments: response.moments,
    deterministic: metrics,
    track_scores: {
      discovery: scoreFor(TRACK_DIMENSION.DISCOVERY),
      objection: scoreFor(TRACK_DIMENSION.OBJECTION),
      dm_setting: scoreFor(TRACK_DIMENSION.DM_SETTING),
      closing: scoreFor(TRACK_DIMENSION.CLOSING),
    },
  };
}

/**
 * Fold a new session's per-track scores into a practitioner's rolling SkillProfile
 * (PRD FR-22, FR-27). Running average: new = round((old*n + sample) / (n+1)) per track,
 * where `n` = prior reps_count. Tracks with no score this session are left unchanged.
 * Returns the next profile values; the caller persists them.
 */
export interface RollingSkillProfile {
  discovery: number;
  objection: number;
  dmSetting: number;
  closing: number;
  repsCount: number;
}

export function foldIntoSkillProfile(
  prev: RollingSkillProfile,
  trackScores: ScoreResult["track_scores"],
): RollingSkillProfile {
  const n = prev.repsCount;
  const roll = (old: number, sample: number | null): number =>
    sample === null ? old : Math.round((old * n + sample) / (n + 1));

  return {
    discovery: roll(prev.discovery, trackScores.discovery),
    objection: roll(prev.objection, trackScores.objection),
    dmSetting: roll(prev.dmSetting, trackScores.dm_setting),
    closing: roll(prev.closing, trackScores.closing),
    repsCount: n + 1,
  };
}

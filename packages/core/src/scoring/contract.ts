import { z } from "zod";
import { DETERMINISTIC_DIMENSION_KEYS, DIMENSION_KEYS, LLM_DIMENSION_KEYS } from "./rubric";

/**
 * The structured-output contract for AI scoring (PRD §6.3). Split into:
 *  - `scoringResponseSchema` — exactly what Claude returns (LLM-judged dimensions only,
 *    plus strengths/growth/moments and which speaker is the seller). Used to validate
 *    the model's structured output.
 *  - `scoreResultSchema` — the fully assembled result we persist: LLM dimensions +
 *    computed deterministic dimensions, overall, the deterministic metrics block, and
 *    the four track scores.
 *
 * Note (structured outputs): numeric `.min/.max` here are validated client-side by the
 * SDK, not enforced by the model (the API strips unsupported JSON-schema constraints).
 * Keep them — they catch a malformed response before we persist it.
 */

const score0to100 = z.number().int().min(0).max(100);

// z.enum needs a non-empty string tuple; the key lists are derived from the rubric.
const llmDimensionKeySchema = z.enum(LLM_DIMENSION_KEYS as [string, ...string[]]);
const anyDimensionKeySchema = z.enum(DIMENSION_KEYS as [string, ...string[]]);

/** One LLM-judged dimension score with cited evidence (PRD §6.4 "evidence required"). */
export const llmDimensionScoreSchema = z.object({
  key: llmDimensionKeySchema,
  score: score0to100,
  /**
   * Transcript turn references that justify the score, e.g. "turn_12" (PRD §6.3, §6.4
   * "evidence required"). At least one is mandatory — a dimension score without evidence
   * is rejected, which triggers the scorer's correction retry.
   */
  evidence: z.array(z.string().min(1)).min(1, "every dimension must cite at least one transcript turn"),
  comment: z.string().default(""),
});
export type LlmDimensionScore = z.infer<typeof llmDimensionScoreSchema>;

/** A timestamped good/missed moment tied to a dimension (PRD §6.3). */
export const momentSchema = z.object({
  t_start_s: z.number().min(0),
  t_end_s: z.number().min(0),
  label: z.enum(["good", "missed"]),
  dimension: anyDimensionKeySchema,
  note: z.string().default(""),
});
export type Moment = z.infer<typeof momentSchema>;

/**
 * Exactly what Claude returns. The model also identifies which diarized speaker is the
 * seller (`seller_speaker`) — the recording is a single composite track, so speaker
 * identity can't come from audio alone; the model infers it from the conversation, and
 * we then compute the seller's deterministic metrics for that label.
 */
export const scoringResponseSchema = z.object({
  seller_speaker: z.string(),
  dimensions: z.array(llmDimensionScoreSchema),
  strengths: z.array(z.string()).default([]),
  growth_areas: z.array(z.string()).default([]),
  moments: z.array(momentSchema).default([]),
});
export type ScoringResponse = z.infer<typeof scoringResponseSchema>;

/** Deterministic metrics computed from the diarized transcript (PRD §6.3 `deterministic`). */
export const deterministicMetricsSchema = z.object({
  seller_talk_pct: z.number().min(0).max(100),
  filler_per_min: z.number().min(0),
  wpm: z.number().min(0),
  longest_monologue_s: z.number().min(0),
});
export type DeterministicMetrics = z.infer<typeof deterministicMetricsSchema>;

/** A fully resolved dimension (LLM or deterministic) as persisted on the Score. */
export const scoredDimensionSchema = z.object({
  key: anyDimensionKeySchema,
  score: score0to100,
  weight: z.number().min(0).max(1),
  kind: z.enum(["llm", "deterministic"]),
  evidence: z.array(z.string()).default([]),
  comment: z.string().default(""),
});
export type ScoredDimension = z.infer<typeof scoredDimensionSchema>;

/** Per-track rolling-score contribution from this session (PRD FR-27). */
export const trackScoresSchema = z.object({
  discovery: score0to100.nullable(),
  objection: score0to100.nullable(),
  dm_setting: score0to100.nullable(),
  closing: score0to100.nullable(),
});
export type TrackScores = z.infer<typeof trackScoresSchema>;

/** The assembled, persisted scoring result (maps onto the Score columns). */
export const scoreResultSchema = z.object({
  overall: score0to100,
  dimensions: z.array(scoredDimensionSchema),
  strengths: z.array(z.string()),
  growth_areas: z.array(z.string()),
  moments: z.array(momentSchema),
  deterministic: deterministicMetricsSchema,
  track_scores: trackScoresSchema,
});
export type ScoreResult = z.infer<typeof scoreResultSchema>;

/**
 * JSON Schema for the structured-output request (Anthropic `output_config.format`).
 * Hand-built (not derived from zod) to avoid a zod-version coupling with the SDK's zod
 * helper and to stay within structured-output limits: every object sets
 * `additionalProperties: false` and lists all properties as `required` (the model fills
 * them). The model's response is still validated against `scoringResponseSchema` after.
 */
export const scoringResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    seller_speaker: { type: "string" },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string", enum: [...LLM_DIMENSION_KEYS] },
          score: { type: "integer" },
          evidence: { type: "array", items: { type: "string" } },
          comment: { type: "string" },
        },
        required: ["key", "score", "evidence", "comment"],
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    growth_areas: { type: "array", items: { type: "string" } },
    moments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          t_start_s: { type: "number" },
          t_end_s: { type: "number" },
          label: { type: "string", enum: ["good", "missed"] },
          dimension: { type: "string", enum: [...DIMENSION_KEYS] },
          note: { type: "string" },
        },
        required: ["t_start_s", "t_end_s", "label", "dimension", "note"],
      },
    },
  },
  required: ["seller_speaker", "dimensions", "strengths", "growth_areas", "moments"],
} as const;

// Re-export the key lists used by callers building prompts / iterating dimensions.
export { DIMENSION_KEYS, LLM_DIMENSION_KEYS, DETERMINISTIC_DIMENSION_KEYS };

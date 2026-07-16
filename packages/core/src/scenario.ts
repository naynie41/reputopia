import { z } from "zod";
import { trackSchema } from "./enums";
import { DIMENSION_KEYS } from "./scoring";

/**
 * Scenario library domain schemas (PRD §5.2 / FR-6–FR-8). Shared by the seed, the tRPC
 * routers, and admin forms so scenario input is validated identically everywhere.
 */

/** Difficulty is 1 (easy) – 3 (hard). */
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 3;
export const difficultySchema = z.number().int().min(MIN_DIFFICULTY).max(MAX_DIFFICULTY);

/** Recommended call length bounds (seconds): 2–60 min. */
export const MIN_SCENARIO_SECONDS = 120;
export const MAX_SCENARIO_SECONDS = 3600;

/**
 * Per-scenario rubric weighting (PRD §6.1 / FR-6). Must cover every rubric dimension and
 * sum to 1 — matches the shape of @sr/core `DEFAULT_WEIGHTS` / `getScenarioWeights`. A
 * scenario stores this so scoring can weight by scenario (wired in the matchmaking step).
 */
export const rubricWeightsSchema = z
  .record(z.string(), z.number().min(0).max(1))
  .refine((w) => DIMENSION_KEYS.every((k) => k in w), {
    message: "rubric weights must include every rubric dimension",
  })
  .refine(
    (w) => Math.abs(Object.values(w).reduce((sum, n) => sum + n, 0) - 1) < 0.001,
    { message: "rubric weights must sum to 1" },
  );
export type RubricWeights = z.infer<typeof rubricWeightsSchema>;

/** Filter the library by track and/or difficulty (FR-8). Active-only by default. */
export const scenarioListInputSchema = z.object({
  track: trackSchema.optional(),
  difficulty: difficultySchema.optional(),
  includeInactive: z.boolean().default(false),
});
export type ScenarioListInput = z.infer<typeof scenarioListInputSchema>;

/** Admin: create a scenario (FR-7). `rubricWeights` defaults to the track preset. */
export const scenarioCreateInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  track: trackSchema,
  difficulty: difficultySchema,
  title: z.string().trim().min(3).max(120),
  context: z.string().trim().min(10).max(2000),
  sellerObjective: z.string().trim().min(10).max(2000),
  counterpartPersona: z.string().trim().min(10).max(2000),
  durationS: z.number().int().min(MIN_SCENARIO_SECONDS).max(MAX_SCENARIO_SECONDS),
  // Optional: when omitted, the router fills in getScenarioWeights(track).
  rubricWeights: rubricWeightsSchema.optional(),
  active: z.boolean().default(true),
});
export type ScenarioCreateInput = z.infer<typeof scenarioCreateInputSchema>;

/** Admin: activate / deactivate a scenario (soft delete). */
export const scenarioSetActiveInputSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
export type ScenarioSetActiveInput = z.infer<typeof scenarioSetActiveInputSchema>;

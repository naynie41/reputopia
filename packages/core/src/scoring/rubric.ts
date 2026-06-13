import { trackSchema, type Track } from "../enums";

/**
 * The scoring rubric (PRD §6.1, §6.4) — the single source of truth for what gets
 * scored and how it is weighted. It is **anchored** (each dimension defines concrete
 * 0/50/100 behavioral descriptions) so the LLM scores consistently, and **versioned**
 * so a Score records which rubric produced it (calibration/QA, PRD §6.4).
 *
 * Two kinds of dimension (PRD §6.1 note):
 *  - "llm"          — judged by Claude against the anchors below.
 *  - "deterministic"— computed from the diarized transcript without an LLM
 *                     (talk ratio, filler/pace). Mixing the two raises trust and cuts cost.
 *
 * Phase 2 uses a single DEFAULT rubric (equal-ish weights). Per-scenario weighting
 * (PRD FR-6 `rubric_weights_json`) plugs in at Phase 3 when the Scenario table exists.
 */

/** Bump when dimensions, anchors, or default weights change (drives calibration CI later). */
export const RUBRIC_VERSION = "2026-06-12";

export type DimensionKind = "llm" | "deterministic";

export interface RubricDimension {
  /** Stable snake_case key persisted in scores and used in the LLM contract. */
  key: string;
  label: string;
  /** One-line description of what the dimension measures (PRD §6.1). */
  measures: string;
  kind: DimensionKind;
  /** Behavioral anchors the LLM calibrates against (PRD §6.4). */
  anchors: { 0: string; 50: string; 100: string };
  /** Weight in the DEFAULT (no-scenario) rubric. All weights sum to 1. */
  defaultWeight: number;
}

export const RUBRIC: readonly RubricDimension[] = [
  {
    key: "discovery",
    label: "Discovery quality",
    measures: "Open questions, uncovering pain, qualifying (budget/authority/need/timeline).",
    kind: "llm",
    anchors: {
      0: "Pitches without questions; no pain uncovered; no qualification.",
      50: "Asks some questions but mostly closed/surface; partial qualification.",
      100: "Layered open questions surface real pain and quantify impact; cleanly qualifies BANT.",
    },
    defaultWeight: 0.18,
  },
  {
    key: "objection",
    label: "Objection handling",
    measures: "Acknowledge → clarify → respond → confirm; stays non-defensive.",
    kind: "llm",
    anchors: {
      0: "Ignores or argues against objections; gets defensive.",
      50: "Responds but skips clarifying or confirming; partially addresses the concern.",
      100: "Acknowledges, clarifies the real concern, responds with evidence, confirms resolution.",
    },
    defaultWeight: 0.18,
  },
  {
    key: "dm_setting",
    label: "DM / cold setting",
    measures: "Pattern interrupt, value framing, securing the next step.",
    kind: "llm",
    anchors: {
      0: "Generic opener, no value frame, no ask for a next step.",
      50: "Some value framing but a weak or vague next step.",
      100: "Earns attention fast, frames clear value, secures a specific committed next step.",
    },
    defaultWeight: 0.12,
  },
  {
    key: "closing",
    label: "Closing",
    measures: "Clear ask, urgency, handling hesitation, locking commitment.",
    kind: "llm",
    anchors: {
      0: "No ask; lets the call end without a next step.",
      50: "Makes an ask but folds at the first hesitation; soft commitment.",
      100: "Clear, confident ask; addresses hesitation; locks a concrete mutual commitment.",
    },
    defaultWeight: 0.18,
  },
  {
    key: "rapport",
    label: "Rapport & active listening",
    measures: "Reflecting, not interrupting, empathy.",
    kind: "llm",
    anchors: {
      0: "Talks over the counterpart; ignores cues; no empathy.",
      50: "Polite but transactional; limited reflecting of what was heard.",
      100: "Builds genuine rapport; reflects and builds on the counterpart's words; well-timed empathy.",
    },
    defaultWeight: 0.12,
  },
  {
    key: "communication",
    label: "Communication & clarity",
    measures: "Concision, structure, jargon control.",
    kind: "llm",
    anchors: {
      0: "Rambling, unstructured, jargon-heavy; hard to follow.",
      50: "Mostly clear but occasionally wordy or unstructured.",
      100: "Concise, well-structured, jargon-appropriate; easy to follow throughout.",
    },
    defaultWeight: 0.12,
  },
  {
    key: "talk_ratio",
    label: "Talk / listen ratio",
    measures: "Seller talk-time %; penalizes monologuing.",
    kind: "deterministic",
    anchors: {
      0: "Seller dominates (monologues / talks ~80%+ of the call).",
      50: "Somewhat unbalanced (seller ~65–75% or under ~30%).",
      100: "Healthy balance (seller ~40–55%); lets the counterpart talk.",
    },
    defaultWeight: 0.05,
  },
  {
    key: "filler_pace",
    label: "Filler & pace",
    measures: "Filler-word rate and words-per-minute band.",
    kind: "deterministic",
    anchors: {
      0: "Heavy filler use and/or pace far outside a clear band.",
      50: "Noticeable filler or pace slightly fast/slow.",
      100: "Minimal filler; pace in a clear, listenable band (~120–160 wpm).",
    },
    defaultWeight: 0.05,
  },
] as const;

/** All dimension keys, in rubric order. */
export const DIMENSION_KEYS = RUBRIC.map((d) => d.key);

/** Keys the LLM scores (everything that is not deterministic). */
export const LLM_DIMENSION_KEYS = RUBRIC.filter((d) => d.kind === "llm").map((d) => d.key);

/** Keys computed from the transcript (talk_ratio, filler_pace). */
export const DETERMINISTIC_DIMENSION_KEYS = RUBRIC.filter((d) => d.kind === "deterministic").map(
  (d) => d.key,
);

export type DimensionWeights = Readonly<Record<string, number>>;

/** key -> default weight, for aggregation. Used when no scenario is specified. */
export const DEFAULT_WEIGHTS: DimensionWeights = Object.fromEntries(
  RUBRIC.map((d) => [d.key, d.defaultWeight]),
);

/**
 * Per-scenario rubric weightings (PRD §6.1 "rubric-driven and scenario-weighted",
 * FR-6 `rubric_weights_json`). Each track preset emphasizes its focal skill — a CLOSING
 * scenario weights `closing` highest, a DISCOVERY scenario weights `discovery` highest,
 * etc. The soft skills (rapport, communication) stay moderate and the deterministic
 * dimensions (talk_ratio, filler_pace) stay light across all presets. Every preset's
 * weights sum to 1.
 *
 * No Scenario table exists yet (Phase 3), so these are keyed by Track. When the Scenario
 * library lands, a scenario's stored `rubric_weights_json` overrides these; until then
 * `getScenarioWeights(track)` selects the preset (or DEFAULT_WEIGHTS when no track).
 */
export const WEIGHT_PRESETS: Readonly<Record<Track, DimensionWeights>> = {
  DISCOVERY: {
    discovery: 0.32,
    objection: 0.12,
    dm_setting: 0.08,
    closing: 0.12,
    rapport: 0.13,
    communication: 0.13,
    talk_ratio: 0.05,
    filler_pace: 0.05,
  },
  OBJECTION: {
    discovery: 0.12,
    objection: 0.32,
    dm_setting: 0.08,
    closing: 0.12,
    rapport: 0.13,
    communication: 0.13,
    talk_ratio: 0.05,
    filler_pace: 0.05,
  },
  DM_SETTING: {
    discovery: 0.12,
    objection: 0.1,
    dm_setting: 0.32,
    closing: 0.1,
    rapport: 0.13,
    communication: 0.13,
    talk_ratio: 0.05,
    filler_pace: 0.05,
  },
  CLOSING: {
    discovery: 0.12,
    objection: 0.12,
    dm_setting: 0.08,
    closing: 0.32,
    rapport: 0.13,
    communication: 0.13,
    talk_ratio: 0.05,
    filler_pace: 0.05,
  },
};

/**
 * Resolve the weights to score with. Pass a scenario's track to emphasize that skill;
 * omit it (Phase 2 default — no Scenario table) for the balanced DEFAULT_WEIGHTS.
 */
export function getScenarioWeights(track?: Track | null): DimensionWeights {
  return track ? WEIGHT_PRESETS[track] : DEFAULT_WEIGHTS;
}

export function getDimension(key: string): RubricDimension | undefined {
  return RUBRIC.find((d) => d.key === key);
}

/**
 * Which rubric dimension feeds each of the four rolling track scores (PRD FR-27,
 * SkillProfile). One-to-one in v1; kept as a map so it can grow.
 */
export const TRACK_DIMENSION: Readonly<Record<Track, string>> = {
  DISCOVERY: "discovery",
  OBJECTION: "objection",
  DM_SETTING: "dm_setting",
  CLOSING: "closing",
};

export const TRACKS_FOR_PROFILE = trackSchema.options;

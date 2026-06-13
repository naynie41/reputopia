import type { DiarizedTranscript, SpeakerMetrics } from "./metrics";
import { LLM_DIMENSION_KEYS, RUBRIC, RUBRIC_VERSION } from "./rubric";

/**
 * Build the scoring prompt (PRD §6.2 step 3). Returns two strings:
 *  - `system` — the stable, reusable instruction + anchored rubric. This is the
 *    cacheable prefix (the Anthropic wrapper marks it with `cache_control`), so every
 *    scoring call reuses it at ~0.1× input cost (PRD §9.4 prompt caching).
 *  - `user`   — the volatile per-call content: scenario brief, per-speaker deterministic
 *    metrics, and the diarized transcript with turn indices for evidence citation.
 *
 * No Anthropic SDK import here — this is pure string assembly, unit-testable without a key.
 */

export interface BuildScoringPromptInput {
  /** Diarized transcript with turn indices used for evidence references. */
  transcript: DiarizedTranscript;
  /** Per-speaker deterministic metrics (context for the model; we score them ourselves). */
  perSpeakerMetrics: Record<string, SpeakerMetrics>;
  /** Scenario context brief + seller objective (Phase 3); omitted = generic roleplay. */
  scenarioBrief?: string;
}

function renderRubric(): string {
  return RUBRIC.map((d) => {
    const tag = d.kind === "deterministic" ? " (computed separately — do NOT score)" : "";
    return [
      `### ${d.key} — ${d.label}${tag}`,
      `What it measures: ${d.measures}`,
      `Anchors:`,
      `  0   = ${d.anchors[0]}`,
      `  50  = ${d.anchors[50]}`,
      `  100 = ${d.anchors[100]}`,
    ].join("\n");
  }).join("\n\n");
}

export function buildScoringSystemPrompt(): string {
  return [
    "You are an expert sales coach scoring a recorded 1:1 sales roleplay call.",
    "You score the SELLER only (the participant trying to sell / advance the deal).",
    "The transcript is diarized by speaker label (e.g. A, B) but speaker identity is not",
    "given — infer which label is the seller from the conversation and return it as",
    "`seller_speaker`.",
    "",
    "Score each LLM-judged dimension below from 0–100, calibrated to its anchors. For",
    "every dimension you MUST cite at least one transcript turn that justifies the score",
    "in `evidence` (e.g. [\"turn_12\", \"turn_34\"]) — a score with no evidence is invalid",
    "and will be rejected. Also give a one-sentence `comment`. Be specific and fair; do",
    "not reward volume or confidence absent substance.",
    "",
    `Score ONLY these dimensions: ${LLM_DIMENSION_KEYS.join(", ")}.`,
    "Dimensions marked \"computed separately\" are scored from metrics, not by you — omit them.",
    "",
    "Also return: `strengths` (2–4 concise items), `growth_areas` (2–4 concise, actionable",
    "items), and `moments` — a few timestamped good/missed moments, each with t_start_s,",
    "t_end_s (from the turn timestamps), a `label` of \"good\" or \"missed\", the related",
    "`dimension`, and a short `note`.",
    "",
    `Rubric version: ${RUBRIC_VERSION}`,
    "",
    "## Rubric",
    renderRubric(),
  ].join("\n");
}

function renderMetrics(perSpeaker: Record<string, SpeakerMetrics>): string {
  const rows = Object.entries(perSpeaker).map(
    ([speaker, m]) =>
      `- Speaker ${speaker}: talk ${m.talk_pct.toFixed(0)}%, ${m.wpm.toFixed(0)} wpm, ` +
      `${m.filler_per_min.toFixed(1)} fillers/min, longest monologue ${m.longest_monologue_s.toFixed(0)}s`,
  );
  return rows.length > 0 ? rows.join("\n") : "(no speaker metrics available)";
}

function renderTranscript(transcript: DiarizedTranscript): string {
  return transcript.turns
    .map((t, i) => `turn_${i} [${t.speaker}] (${t.start_s.toFixed(1)}–${t.end_s.toFixed(1)}s): ${t.text}`)
    .join("\n");
}

export function buildScoringUserPrompt(input: BuildScoringPromptInput): string {
  const { transcript, perSpeakerMetrics, scenarioBrief } = input;
  return [
    "## Scenario",
    scenarioBrief?.trim() ||
      "No specific scenario — score this as a general sales roleplay using the rubric.",
    "",
    "## Per-speaker metrics (deterministic; for your context only)",
    renderMetrics(perSpeakerMetrics),
    "",
    `## Diarized transcript (${transcript.duration_s.toFixed(0)}s, speakers: ${transcript.speakers.join(", ")})`,
    renderTranscript(transcript),
  ].join("\n");
}

export function buildScoringPrompt(input: BuildScoringPromptInput): {
  system: string;
  user: string;
} {
  return {
    system: buildScoringSystemPrompt(),
    user: buildScoringUserPrompt(input),
  };
}

import type { DeterministicMetrics, ScoredDimension } from "./contract";
import { DEFAULT_WEIGHTS } from "./rubric";

/**
 * Deterministic metrics + dimension scoring, computed from the diarized transcript
 * without an LLM (PRD §6.1 note, §6.2 step 2). Pure functions — no I/O — so they are
 * fully unit-testable and cheap. Trust-critical: these resist "gaming the score"
 * (PRD §11) and are surfaced to the user as hard numbers.
 */

/** One diarized turn, normalized from the transcription provider's utterances. */
export interface DiarizedTurn {
  /** Provider speaker label, e.g. "A" / "B". Identity is resolved later by the LLM. */
  speaker: string;
  text: string;
  start_s: number;
  end_s: number;
}

/** Normalized diarized transcript (provider-agnostic). */
export interface DiarizedTranscript {
  turns: DiarizedTurn[];
  duration_s: number;
  /** Distinct speaker labels present, in first-appearance order. */
  speakers: string[];
}

export interface SpeakerMetrics {
  talk_pct: number;
  filler_per_min: number;
  wpm: number;
  longest_monologue_s: number;
  talk_seconds: number;
  word_count: number;
}

/**
 * Filler words/phrases counted toward the filler rate. Lowercased, word-boundary
 * matched. Multi-word entries ("you know") are matched as phrases.
 */
export const FILLER_WORDS: readonly string[] = [
  "um",
  "uh",
  "er",
  "ah",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "literally",
  "actually",
  "right",
];

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function countFillers(text: string): number {
  const lower = ` ${text.toLowerCase()} `;
  let count = 0;
  for (const filler of FILLER_WORDS) {
    // Word-boundary-safe count of this filler word/phrase.
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lower.match(new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "g"));
    if (matches) count += matches.length;
  }
  return count;
}

/** Longest contiguous span (seconds) in which `speaker` holds the floor uninterrupted. */
function longestMonologue(turns: DiarizedTurn[], speaker: string): number {
  let longest = 0;
  let runStart: number | null = null;
  let runEnd = 0;
  for (const turn of turns) {
    if (turn.speaker === speaker) {
      if (runStart === null) runStart = turn.start_s;
      runEnd = turn.end_s;
    } else {
      if (runStart !== null) longest = Math.max(longest, runEnd - runStart);
      runStart = null;
    }
  }
  if (runStart !== null) longest = Math.max(longest, runEnd - runStart);
  return Math.max(0, longest);
}

/** Per-speaker metrics for every speaker in the transcript. */
export function computePerSpeakerMetrics(
  transcript: DiarizedTranscript,
): Record<string, SpeakerMetrics> {
  const { turns } = transcript;
  const totalTalkSeconds = turns.reduce((sum, t) => sum + Math.max(0, t.end_s - t.start_s), 0);

  const out: Record<string, SpeakerMetrics> = {};
  for (const speaker of transcript.speakers) {
    const own = turns.filter((t) => t.speaker === speaker);
    const talkSeconds = own.reduce((sum, t) => sum + Math.max(0, t.end_s - t.start_s), 0);
    const wordCount = own.reduce((sum, t) => sum + countWords(t.text), 0);
    const fillerCount = own.reduce((sum, t) => sum + countFillers(t.text), 0);
    const minutes = talkSeconds / 60;

    out[speaker] = {
      talk_pct: totalTalkSeconds > 0 ? (talkSeconds / totalTalkSeconds) * 100 : 0,
      filler_per_min: minutes > 0 ? fillerCount / minutes : 0,
      wpm: minutes > 0 ? wordCount / minutes : 0,
      longest_monologue_s: longestMonologue(turns, speaker),
      talk_seconds: talkSeconds,
      word_count: wordCount,
    };
  }
  return out;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Pick the seller's metrics. `sellerSpeaker` comes from the LLM's `seller_speaker`;
 * if it's missing/unknown, fall back to the speaker with the most talk time (the seller
 * usually drives a roleplay). Returns zeros if there are no speakers.
 */
export function selectSellerMetrics(
  perSpeaker: Record<string, SpeakerMetrics>,
  sellerSpeaker: string | undefined,
): DeterministicMetrics {
  const named = sellerSpeaker !== undefined ? perSpeaker[sellerSpeaker] : undefined;
  // Fall back to the most-talkative speaker (the seller usually drives a roleplay).
  const mostTalkative = Object.values(perSpeaker).sort(
    (a, b) => b.talk_seconds - a.talk_seconds,
  )[0];
  const chosen = named ?? mostTalkative;
  if (!chosen) {
    return { seller_talk_pct: 0, filler_per_min: 0, wpm: 0, longest_monologue_s: 0 };
  }

  return {
    seller_talk_pct: round1(chosen.talk_pct),
    filler_per_min: round1(chosen.filler_per_min),
    wpm: round1(chosen.wpm),
    longest_monologue_s: round1(chosen.longest_monologue_s),
  };
}

/** Score the talk/listen ratio (0–100). Ideal band ~40–55%; monologues penalized. */
function scoreTalkRatio(pct: number, longestMonologueS: number): number {
  let s: number;
  if (pct >= 40 && pct <= 55) s = 100;
  else if (pct < 40) s = 100 - (40 - pct) * 2.5; // talking too little
  else s = 100 - (pct - 55) * 3; // monologuing / dominating
  const monoPenalty = Math.min(30, Math.max(0, (longestMonologueS - 90) / 3));
  return clamp(Math.round(s - monoPenalty));
}

/** Score filler + pace (0–100). Low filler and a ~120–160 wpm band are ideal. */
function scoreFillerPace(fillerPerMin: number, wpm: number): number {
  const fillerScore = clamp(100 - fillerPerMin * 8);
  let paceScore: number;
  if (wpm >= 120 && wpm <= 160) paceScore = 100;
  else if (wpm < 120) paceScore = clamp(100 - (120 - wpm));
  else paceScore = clamp(100 - (wpm - 160));
  return clamp(Math.round(0.6 * fillerScore + 0.4 * paceScore));
}

/**
 * Turn the seller's deterministic metrics into scored rubric dimensions
 * (talk_ratio, filler_pace), ready to merge with the LLM-judged dimensions.
 */
export function scoreDeterministicDimensions(metrics: DeterministicMetrics): ScoredDimension[] {
  return [
    {
      key: "talk_ratio",
      score: scoreTalkRatio(metrics.seller_talk_pct, metrics.longest_monologue_s),
      weight: DEFAULT_WEIGHTS["talk_ratio"] ?? 0,
      kind: "deterministic",
      evidence: [],
      comment: `Seller talk ${metrics.seller_talk_pct}% · longest monologue ${metrics.longest_monologue_s}s`,
    },
    {
      key: "filler_pace",
      score: scoreFillerPace(metrics.filler_per_min, metrics.wpm),
      weight: DEFAULT_WEIGHTS["filler_pace"] ?? 0,
      kind: "deterministic",
      evidence: [],
      comment: `${metrics.filler_per_min} fillers/min · ${metrics.wpm} wpm`,
    },
  ];
}

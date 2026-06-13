import type { DiarizedTranscript } from "./metrics";

/**
 * Calibration set (PRD §6.4) — a small corpus of reference reps with expected score
 * ranges, used as a guardrail so rubric or model changes don't silently break scoring.
 *
 * Two layers consume these cases:
 *  - The DETERMINISTIC expectations (metrics + talk_ratio/filler_pace dimension scores)
 *    are pure and asserted in calibration.test.ts — they run on every `pnpm test` with no
 *    API key, catching drift in the metric logic.
 *  - The LLM expectations (overall + judged-dimension ranges) are checked by the live
 *    calibration test in @sr/jobs, which calls Claude and only runs when a real
 *    ANTHROPIC_API_KEY is present (it skips otherwise).
 *
 * Ranges are intentionally wide/behavioral (a strong discovery call scores high on
 * discovery; a filler-heavy monologue scores low on talk_ratio) — the goal is to flag
 * real regressions, not to over-fit exact numbers.
 */

export type Range = readonly [min: number, max: number];

export interface CalibrationCase {
  name: string;
  transcript: DiarizedTranscript;
  /** The seller's diarized speaker label for this fixture. */
  sellerSpeaker: string;
  expect: {
    deterministic: {
      seller_talk_pct: Range;
      filler_per_min: Range;
      wpm: Range;
      longest_monologue_s?: Range;
    };
    /** Expected deterministic dimension scores (computed, no LLM). */
    deterministicDimensions: { talk_ratio: Range; filler_pace: Range };
    /** Expected overall score range (checked by the live scorer). */
    overall: Range;
    /** Expected ranges for specific LLM-judged dimensions (checked by the live scorer). */
    llmDimensions: Partial<Record<string, Range>>;
  };
}

export function inRange(value: number, [min, max]: Range): boolean {
  return value >= min && value <= max;
}

export const CALIBRATION_CASES: readonly CalibrationCase[] = [
  {
    // Strong, balanced discovery: open questions, uncovers pain, quantifies impact.
    name: "strong_discovery",
    sellerSpeaker: "A",
    transcript: {
      duration_s: 50,
      speakers: ["A", "B"],
      turns: [
        { speaker: "A", text: "so walk me through how your team books meetings today and where it tends to break down", start_s: 0, end_s: 10 },
        { speaker: "B", text: "honestly our reps just blast emails and follow up whenever so a lot of interest slips through", start_s: 10, end_s: 20 },
        { speaker: "A", text: "got it and when a lead does respond who owns the follow up and how fast does it usually happen", start_s: 20, end_s: 30 },
        { speaker: "B", text: "it depends sometimes same day sometimes three days later it is not consistent at all", start_s: 30, end_s: 42 },
        { speaker: "A", text: "and what would you say that inconsistency costs you in lost deals each quarter", start_s: 42, end_s: 50 },
      ],
    },
    expect: {
      deterministic: {
        seller_talk_pct: [45, 65],
        filler_per_min: [0, 4],
        wpm: [60, 175],
        longest_monologue_s: [0, 12],
      },
      deterministicDimensions: { talk_ratio: [80, 100], filler_pace: [55, 100] },
      overall: [60, 95],
      llmDimensions: { discovery: [65, 100] },
    },
  },
  {
    // Weak monologue pitch: seller dominates, no discovery, filler-heavy, no clear ask.
    name: "weak_monologue",
    sellerSpeaker: "A",
    transcript: {
      duration_s: 60,
      speakers: ["A", "B"],
      turns: [
        { speaker: "A", text: "um so basically like our product is um you know really great and uh i think you will love it and basically it does everything and um yeah honestly like everyone says it is the best you know so", start_s: 0, end_s: 45 },
        { speaker: "B", text: "okay sure", start_s: 45, end_s: 48 },
        { speaker: "A", text: "and um like i mean the pricing is basically flexible you know so uh yeah it is great", start_s: 48, end_s: 60 },
      ],
    },
    expect: {
      deterministic: {
        seller_talk_pct: [85, 100],
        filler_per_min: [5, 30],
        wpm: [20, 110],
        longest_monologue_s: [40, 60],
      },
      deterministicDimensions: { talk_ratio: [0, 20], filler_pace: [0, 45] },
      overall: [0, 45],
      llmDimensions: { discovery: [0, 40], closing: [0, 45] },
    },
  },
  {
    // Solid objection handling: acknowledge -> clarify -> respond with evidence -> confirm.
    name: "objection_handling",
    sellerSpeaker: "A",
    transcript: {
      duration_s: 46,
      speakers: ["A", "B"],
      turns: [
        { speaker: "B", text: "honestly your price is a lot higher than the tool we use now i am not sure it is worth it", start_s: 0, end_s: 8 },
        { speaker: "A", text: "that is fair can i ask what you are comparing against and what results you are getting from it today", start_s: 8, end_s: 20 },
        { speaker: "B", text: "we use a cheaper tool but deliverability is poor and we lose a lot of leads", start_s: 20, end_s: 28 },
        { speaker: "A", text: "that is exactly the gap we close teams switching over recover about twenty percent more replies which usually covers the difference in a month would it help if i showed you the deliverability data", start_s: 28, end_s: 42 },
        { speaker: "B", text: "yeah that would actually help", start_s: 42, end_s: 46 },
      ],
    },
    expect: {
      deterministic: {
        seller_talk_pct: [45, 70],
        filler_per_min: [0, 5],
        wpm: [60, 180],
        longest_monologue_s: [0, 16],
      },
      deterministicDimensions: { talk_ratio: [80, 100], filler_pace: [55, 100] },
      overall: [55, 95],
      llmDimensions: { objection: [65, 100] },
    },
  },
];

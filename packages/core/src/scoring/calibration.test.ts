import { describe, expect, it } from "vitest";
import { CALIBRATION_CASES, inRange } from "./calibration";
import {
  computePerSpeakerMetrics,
  scoreDeterministicDimensions,
  selectSellerMetrics,
} from "./metrics";

/**
 * Always-on calibration guardrail (PRD §6.4): asserts the DETERMINISTIC half of each
 * reference case — the computed metrics and the talk_ratio/filler_pace dimension scores —
 * stays within its expected range. Pure, no API key. If the metric logic drifts, this
 * fails. The LLM half (overall + judged dimensions) is checked by the live calibration
 * test in @sr/jobs.
 */
describe("calibration — deterministic metrics", () => {
  for (const c of CALIBRATION_CASES) {
    describe(c.name, () => {
      const perSpeaker = computePerSpeakerMetrics(c.transcript);
      const metrics = selectSellerMetrics(perSpeaker, c.sellerSpeaker);
      const dims = scoreDeterministicDimensions(metrics);
      const talkRatio = dims.find((d) => d.key === "talk_ratio")!.score;
      const fillerPace = dims.find((d) => d.key === "filler_pace")!.score;

      it("seller talk %, filler/min, wpm within expected ranges", () => {
        const e = c.expect.deterministic;
        expect(inRange(metrics.seller_talk_pct, e.seller_talk_pct), `talk% ${metrics.seller_talk_pct}`).toBe(true);
        expect(inRange(metrics.filler_per_min, e.filler_per_min), `filler ${metrics.filler_per_min}`).toBe(true);
        expect(inRange(metrics.wpm, e.wpm), `wpm ${metrics.wpm}`).toBe(true);
        if (e.longest_monologue_s) {
          expect(
            inRange(metrics.longest_monologue_s, e.longest_monologue_s),
            `monologue ${metrics.longest_monologue_s}`,
          ).toBe(true);
        }
      });

      it("deterministic dimension scores within expected ranges", () => {
        expect(inRange(talkRatio, c.expect.deterministicDimensions.talk_ratio), `talk_ratio ${talkRatio}`).toBe(true);
        expect(inRange(fillerPace, c.expect.deterministicDimensions.filler_pace), `filler_pace ${fillerPace}`).toBe(true);
      });
    });
  }
});

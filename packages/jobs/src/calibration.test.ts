import { describe, expect, it } from "vitest";
import {
  CALIBRATION_CASES,
  aggregate,
  computePerSpeakerMetrics,
  inRange,
  selectSellerMetrics,
} from "@sr/core";

/**
 * Live calibration (PRD §6.4) — runs the real Claude scoring step against the reference
 * reps and flags drift in `overall` / judged-dimension scores. This is the guardrail to
 * run when changing the rubric or model.
 *
 * It calls the Anthropic API, so it only runs with a real ANTHROPIC_API_KEY and is
 * SKIPPED otherwise (placeholder key or unset) — keeping `pnpm test` green in CI/local
 * without spending. Run it deliberately:  ANTHROPIC_API_KEY=sk-... pnpm --filter @sr/jobs test
 *
 * The deterministic half of each case is asserted (always-on, no key) in
 * @sr/core's calibration.test.ts.
 */
const key = process.env.ANTHROPIC_API_KEY;
const RUN_LIVE = !!key && !key.startsWith("placeholder");

describe.skipIf(!RUN_LIVE)("calibration — live LLM scoring", () => {
  it.each(CALIBRATION_CASES.map((c) => [c.name, c] as const))(
    "%s scores within expected ranges",
    async (_name, c) => {
      // Imported lazily so the Anthropic/env modules only load when actually running.
      const { scoreTranscript } = await import("./providers/anthropic");

      const perSpeaker = computePerSpeakerMetrics(c.transcript);
      const { response } = await scoreTranscript({
        transcript: c.transcript,
        perSpeakerMetrics: perSpeaker,
      });
      const metrics = selectSellerMetrics(perSpeaker, response.seller_speaker);
      const result = aggregate(response, metrics);

      expect(
        inRange(result.overall, c.expect.overall),
        `overall ${result.overall} outside ${c.expect.overall.join("–")}`,
      ).toBe(true);

      for (const [dimKey, range] of Object.entries(c.expect.llmDimensions)) {
        if (!range) continue;
        const dim = result.dimensions.find((d) => d.key === dimKey);
        expect(dim, `missing dimension ${dimKey}`).toBeDefined();
        expect(
          inRange(dim!.score, range),
          `${dimKey} ${dim!.score} outside ${range.join("–")}`,
        ).toBe(true);
      }
    },
    60_000,
  );
});

import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { serverEnv } from "@sr/config/env.server";
import {
  buildScoringPrompt,
  scoringResponseJsonSchema,
  scoringResponseSchema,
  type BuildScoringPromptInput,
  type ScoringResponse,
} from "@sr/core";

/**
 * Claude rubric scoring (PRD §6.2 step 3, §9.4 model tiering).
 *
 * - Model: Sonnet 4.6 — the default production scoring tier ($3/$15). Haiku 4.5 is for
 *   cheap classification subtasks and Opus 4.8 for disputed/deep re-analysis (Phase 6);
 *   neither is wired here.
 * - Prompt caching: the rubric system prompt is identical across every scoring call (and
 *   across correction retries), so it's marked `cache_control: ephemeral` — cached input
 *   bills at ~0.1× (PRD §9.4). The volatile transcript goes in the user turn, after the
 *   cached prefix.
 * - Structured output: `output_config.format` with a JSON Schema constrains the response
 *   shape; we validate the returned JSON against the @sr/core zod contract ourselves (one
 *   source of truth in @sr/core, no coupling to the SDK's zod helper). zod enforces rules
 *   the JSON Schema can't (e.g. evidence is mandatory per dimension).
 * - On a validation failure we retry WITH A CORRECTION: the model's invalid output plus
 *   the zod errors are fed back so it can fix the response, up to MAX_SCORING_ATTEMPTS.
 *   After the cap we throw NonRetriableError — re-running the identical prompt won't help,
 *   so Inngest shouldn't burn its retries on it (transient API errors still propagate as
 *   ordinary errors and DO get retried).
 * - Real-time Messages API (not Batch) to meet the < 3 min p50 / < 6 min p95 SLA
 *   (PRD §7 / FR-23); caching still discounts the big rubric.
 */
export const SCORING_MODEL = "claude-sonnet-4-6";

/** Initial attempt + correction retries before failing the step. */
const MAX_SCORING_ATTEMPTS = 3;

const client = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

export interface ScoringResult {
  response: ScoringResponse;
  /** Claude model id that produced the score (persisted for calibration/QA). */
  model: string;
}

function describeValidationError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

function extractJsonText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export async function scoreTranscript(input: BuildScoringPromptInput): Promise<ScoringResult> {
  const { system, user } = buildScoringPrompt(input);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_SCORING_ATTEMPTS; attempt++) {
    // Transient API errors (429/5xx) throw here and propagate so Inngest retries the step.
    const message = await client.messages.create({
      model: SCORING_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: scoringResponseJsonSchema } },
      messages,
    });

    if (message.stop_reason === "refusal") {
      throw new NonRetriableError("Scoring request was refused by the model safety classifier.");
    }

    const json = extractJsonText(message);
    try {
      if (!json.trim()) throw new Error("model returned no text output");
      // zod is the source of truth — enforces shape AND that every dimension cites evidence.
      const response = scoringResponseSchema.parse(JSON.parse(json));
      return { response, model: message.model ?? SCORING_MODEL };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_SCORING_ATTEMPTS) {
        // Feed the invalid output + errors back so the model can correct itself. Echo the
        // assistant content unchanged (incl. thinking blocks) per same-model replay rules.
        messages.push({ role: "assistant", content: message.content as Anthropic.ContentBlockParam[] });
        messages.push({
          role: "user",
          content:
            `Your previous response did not satisfy the required schema. Errors: ${describeValidationError(err)}. ` +
            `Return ONLY a corrected JSON object matching the schema exactly. Score only the LLM-judged ` +
            `dimensions, and every dimension MUST include at least one evidence entry referencing a transcript ` +
            `turn (e.g. "turn_12").`,
        });
      }
    }
  }

  throw new NonRetriableError(
    `Scoring output failed validation after ${MAX_SCORING_ATTEMPTS} attempts: ${describeValidationError(lastError)}`,
  );
}

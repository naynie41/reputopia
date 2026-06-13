# @sr/jobs — Inngest functions (async pipeline)

The durable, retried Inngest functions for the post-call async pipeline (PRD §6.2 / §9.5,
DevOps handover §9). Served by the web app at `/api/inngest`.

## Phase 2 — scoring pipeline (`score-session`)

Triggered by `session/ended` (emitted by the LiveKit webhook once a recording is READY):

```
init -> submit transcription -> poll (durable) -> score (Claude) -> persist -> notify
```

- **init** — load the session, stub `Score` (PROCESSING) + `Transcript` (PENDING) so the
  UI shows "analysis in progress" (FR-23).
- **transcription** — AssemblyAI batch, speaker-diarized, via a short-lived signed R2 URL
  ([providers/assemblyai.ts](src/providers/assemblyai.ts)). Submit + poll across durable
  steps (no long-running invocation, no extra webhook).
- **score** — deterministic metrics ([@sr/core](../core)) + Claude Sonnet 4.6 with the
  cached rubric and structured output ([providers/anthropic.ts](src/providers/anthropic.ts)).
- **persist** — write `Score` (COMPLETE) and roll the seller's `SkillProfile`, atomically.
- **notify** — emit `score/created` (the seam for the Phase 6 Resend fan-out).

Concurrency is capped and retries bounded to respect AssemblyAI/Anthropic rate limits;
`onFailure` marks the Score/Transcript FAILED so the UI can offer "scoring failed, retry".

## Rules

- All scoring/transcription is async here — never in a request handler (CLAUDE.md).
- The rubric, output contract, deterministic metrics, and aggregation are pure and live
  in [@sr/core](../core) (`scoring/`); this package only does I/O + orchestration.

## Local dev

Run the app (`pnpm dev`) and the Inngest dev server:

```
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Inngest cloud keys (`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`) are only needed in
deployed environments.

## Later phases

- `score/created` → Resend email + in-app notification (Phase 6).
- `user.deletion_requested` → GDPR hard-delete (R2 + transcript + score) (Phase 6).

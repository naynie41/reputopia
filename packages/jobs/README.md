# @sr/jobs — Inngest functions (PLACEHOLDER)

Reserved for **Phase 2+**. This package will hold the durable, retried Inngest
functions for the async pipeline (per PRD §9.5 and the DevOps handover §9):

- `session.ended` → submit recording to AssemblyAI (batch, diarized)
- `transcript.ready` → deterministic metrics → Claude scoring (Batch, cached rubric) → persist
- `score.created` → notifications (Resend + in-app)
- `user.deletion_requested` → GDPR hard-delete (R2 + transcript + score)

Intentionally **not** wired as a pnpm workspace package yet (no `package.json`) so
Phase 0 installs nothing for it. Do not build here until Phase 2.

# CLAUDE.md

Guidance for Claude Code when working in this repository. Read this fully before making changes. Keep it updated as the project evolves.

---

## Project

**Sales Roleplay** — a desktop web application where sales professionals match for live roleplay calls, get AI analysis and scoring after each call, and build a showcase portfolio. Recruiters and managers filter and review candidates by demonstrated skill.

**Reference docs live in `/docs`** — read them before non-trivial work:
- `docs/PRD.md` — product spec, user roles, AI scoring rubric, data model, phased build plan.
- `docs/cost-and-pricing.md` — unit economics and budget targets.
- `docs/devops-handover.md` — environments, CI/CD, secrets, webhooks, security, runbooks.

When the PRD and this file disagree, ask rather than guessing.

---

## Current status

**Phase 0 — Foundations: ✅ COMPLETE.** Sign up → pick role → edit profile.
**Phase 1 — Live call MVP: ✅ COMPLETE.** LiveKit 1:1 calls, device/controls, Egress recording → R2, consent.
**Phase 2 — Scoring pipeline: ✅ COMPLETE (code-complete; one manual live check remains).** Acceptance met by layer: lint/typecheck/tests/build green, migration applied to the Neon dev branch, deterministic calibration green. The full **live** loop ("a finished call automatically produces a scored rep") has **not been run against the real AssemblyAI/Anthropic APIs** — local `.env` has placeholder keys; that's the one remaining manual confirmation. To run it: set real `ASSEMBLYAI_API_KEY` + `ANTHROPIC_API_KEY`, `pnpm dev` + `npx inngest-cli dev -u http://localhost:3000/api/inngest`, finish a recorded call, open `/reps/<sessionId>`, and confirm `Score` (COMPLETE) + updated `SkillProfile`. Run the live calibration first: `ANTHROPIC_API_KEY=sk-... pnpm --filter @sr/jobs test`.

**Next: Phase 3 (Matchmaking, Redis queue). Do NOT start it unless asked.** Build only what the current phase calls for.

What exists after Phase 2: everything from Phases 0–1, plus the async scoring pipeline in `@sr/jobs` (Inngest): `session/ended` → AssemblyAI batch diarized transcription → deterministic metrics → Claude (Sonnet 4.6, cached rubric, structured output, validated against the zod contract with a correction-retry) → persist `Score` + roll `SkillProfile` → emit `score/created`. The rubric, output contract, deterministic metrics, aggregation, and the calibration set are pure code in `@sr/core` (`scoring/`). Served at `/api/inngest` (public in `proxy.ts`); the LiveKit webhook emits `session/ended` on egress-complete. The **rep detail view** at `/reps/[sessionId]` (owner-authorized `score.getBySession` tRPC read + signed recording URL) shows the player, score, dimension breakdown with clickable evidence, strengths/growth, moments, and transcript; the post-call screen links to it. No practitioner/recruiter dashboards yet (Phase 4–5).

**Phase 2 design decisions (owner-approved):** score on the **real-time Messages API** (not Batch) to meet the < 3 min p50 SLA — caching still discounts the rubric; **poll AssemblyAI inside one durable Inngest function** (no extra webhook); the **LLM identifies which diarized speaker is the seller** (composite room recording has no per-speaker identity — per-participant track egress would be a Phase 1 change, deferred); a **single default rubric** (no Scenario table) — per-scenario weighting (`WEIGHT_PRESETS`/`getScenarioWeights`) is built but unwired until Phase 3; rep view is **seller-only** ("own reps") — counterpart/recruiter access is a later phase.

> **Not done in Phase 0 (deferred):** see the "Known gaps / deferred" section at the bottom.

---

## Tech stack (do not substitute without asking)

- **Language:** TypeScript everywhere. No JavaScript files.
- **Framework:** Next.js (App Router), React.
- **API:** tRPC for type-safe client↔server calls. Route Handlers only for webhooks and health.
- **Styling:** Tailwind CSS + shadcn/ui. TanStack Query for server state; Zustand only for small client state.
- **Auth:** Clerk (with organizations + roles for recruiters/managers).
- **Database:** PostgreSQL on Neon, via Prisma ORM.
- **Real-time calls:** LiveKit Cloud (later phase).
- **Background jobs:** Inngest (later phase).
- **Queue / rate-limit:** Upstash Redis (later phase).
- **Transcription:** AssemblyAI · **AI scoring:** Anthropic Claude API (later phase).
- **Storage:** Cloudflare R2 · **Email:** Resend (later phases).
- **Hosting:** Vercel · **Monitoring:** Sentry · **Analytics:** PostHog.

This is a fully managed/serverless stack. **There is no Docker in production.** A local `docker-compose.yml` for Postgres/Redis is optional; we use a Neon dev branch + Upstash for local data by default.

---

## Repo structure (pnpm monorepo)

Actual layout as of Phase 0 (package names in parens):

```
/apps/web                     (@sr/web)    Next.js 16 App Router app
  src/app/                                 routes
    page.tsx                               public marketing/landing (redirects if signed in)
    sign-in/, sign-up/                     Clerk catch-all routes
    onboarding/                            one-time role selection (FR-2)
    (app)/                                 authenticated route GROUP (sidebar shell + gating)
      layout.tsx                           auth + onboarded gate; renders AppSidebar
      dashboard/, profile/                 role-aware pages
      reps/[sessionId]/                    rep detail view (scored rep: player + score + transcript)
    call/[sessionId]/                      full-screen live call (outside sidebar shell)
    api/trpc/[trpc]/                       tRPC fetch handler
    api/inngest/                           Inngest serve endpoint (public in proxy.ts; signed)
    api/webhooks/clerk/, api/webhooks/livekit/  Clerk + LiveKit webhooks (verified)
    api/health/                            DB health probe
  src/server/trpc/routers/                 profile, call (roleplay), consent, score
  src/server/{livekit,r2}.ts               LiveKit egress/tokens + R2 signed URLs (server-only)
  src/trpc/                                client.tsx (provider+useTRPC), server.ts (RSC caller), query-client.ts
  src/components/{ui,call,rep}/            shadcn primitives, call experience, rep-detail
/packages/config              (@sr/config) zod env schema (env.server/env.client), shared eslint + tsconfig base
/packages/core                (@sr/core)   enums + domain zod schemas (profile, onboarding, call); scoring/ (rubric+anchors, weight presets, output contract, deterministic metrics, prompt builder, aggregate, calibration set) — all pure + unit-tested
/packages/db                  (@sr/db)     Prisma 7 schema, prisma.config.ts, generated/ client, src/index.ts singleton, seed
/packages/jobs                (@sr/jobs)   Inngest client + functions (score-session) + provider wrappers (assemblyai, anthropic, r2) + live calibration test; served at apps/web /api/inngest
/docs                                      PRD, devops handover, this file (cost-and-pricing.md still missing)
```

Put shared types and domain logic in `/packages/core`, not in the app. Keep the Prisma schema and all DB access in `/packages/db`. App/page code reads through tRPC (client hooks or the RSC caller in `src/trpc/server.ts`) — not ad-hoc Prisma in pages.

---

## Commands

Use **pnpm** (these root scripts exist):

- `pnpm dev` — run the app locally (Next dev, Turbopack)
- `pnpm build` — production build
- `pnpm lint` — ESLint (all packages, `-r`)
- `pnpm typecheck` — `tsc --noEmit` (all packages, `-r`)
- `pnpm test` — unit tests (Vitest)
- `pnpm db:generate` — `prisma generate`
- `pnpm db:migrate` — `prisma migrate dev` (local)
- `pnpm db:deploy` — `prisma migrate deploy` (CI/prod)
- `pnpm db:studio` — Prisma Studio
- `pnpm db:seed` — idempotent seed (admin user + sample org)
- `pnpm format` / `pnpm format:check` — Prettier
- **Inngest dev:** `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` (run alongside `pnpm dev` to execute jobs locally; dashboard at :8288)
- **Live scoring calibration (PRD §6.4 guardrail, costs API credits):** `ANTHROPIC_API_KEY=sk-... pnpm --filter @sr/jobs test` — scores the reference reps and flags drift outside expected ranges. Skips automatically without a real key. The deterministic half runs in plain `pnpm test`.

**Always run `pnpm lint` and `pnpm typecheck` before considering a task done.** Fix what they flag.

> **Versions & gotchas (differ from older defaults):** Next.js 16 (middleware file is `src/proxy.ts`, not `middleware.ts`), Clerk v7 (`<Show when="signed-in|signed-out">` replaces `<SignedIn>/<SignedOut>`; `verifyWebhook` from `@clerk/nextjs/webhooks`), Prisma 7 (driver adapter required — Neon adapter with pooled `DATABASE_URL`; connection URLs live in `packages/db/prisma.config.ts` using `DIRECT_URL` for migrations; generator emits TS to `packages/db/generated/client`, import from `../generated/client/client`), tRPC v11 (`@trpc/tanstack-react-query`), Tailwind v4. Next reads `.env` from `apps/web`, so `apps/web/next.config.ts` loads the **monorepo-root `.env`** (single source of truth, shared with the Prisma CLI). Env is validated by zod in `@sr/config` — never read `process.env` directly in app code.

---

## Conventions

- **Type safety end to end.** No `any`. Validate all external input (forms, webhooks, env) with **zod**. Infer types from Prisma and zod; don't hand-write duplicate types.
- **Env vars** are validated at boot via a zod schema in `/packages/config`. A missing var must fail fast. Never read `process.env` directly in app code — import from the validated config.
- **Keep a `.env.example`** updated with every new key (names only, never values). Never commit real secrets.
- **Database connections:** use the **pooled** `DATABASE_URL` at runtime and the **direct** `DIRECT_URL` only for migrations. This matters on serverless — don't change it.
- **Naming:** kebab-case files, PascalCase components, camelCase functions/vars. Co-locate component + its test.
- **Commits:** small and conventional (`feat:`, `fix:`, `chore:`). One logical change per commit.
- **Comments:** explain *why*, not *what*. Don't narrate obvious code.
- Prefer editing existing files over creating new ones; don't add dependencies without a clear need.

---

## Architecture rules (important — these prevent rework)

- **Webhooks do minimal work: verify signature → persist → enqueue.** Never run transcription, scoring, or any slow task inside a webhook or request handler — it will time out. Heavy work goes to Inngest jobs.
- **All scoring/transcription is async** and runs in Inngest with retries and idempotency. The request path never waits on it.
- **Authorize every read.** A recruiter may only fetch reps a practitioner has explicitly *showcased*. Enforce this in the tRPC layer, not just the UI.
- **Migrations are backward-compatible** (expand-then-contract). Never write a migration a rolled-back app version can't run against.

---

## Security & data (highest-risk area — we store recorded calls of real people)

- Recordings live in a **private R2 bucket**; serve only via **short-lived signed URLs**. Never make recordings public.
- TLS in transit, encryption at rest (providers handle this) — don't roll your own.
- Recording **consent** is required before a user's first call; keep the consent text versioned.
- Support **hard delete**: deleting a rep or account must remove the recording, transcript, and score.
- Least-privilege API keys; never log secrets, tokens, or PII.

---

## How to work

1. Before a task, check the PRD and this file for the relevant rules.
2. Stay within the current phase's scope. If a task implies later-phase work, flag it.
3. Make the change, then run `pnpm lint` and `pnpm typecheck`; add or update tests where it makes sense.
4. Explain what changed and why in your summary. If you made a non-obvious decision or assumption, say so.
5. If a requirement is ambiguous or a doc conflicts with reality, **ask before proceeding.**

---

## Known gaps / deferred (updated through Phase 2)

Tracked here so a future session doesn't mistake these for bugs:

- **Repo is not under git yet.** No commits exist. `git init` + an initial commit is pending the owner's go-ahead.
- **`CLERK_WEBHOOK_SIGNING_SECRET` is a placeholder** in local `.env`. Live Clerk→Postgres sync is inactive until it's set and a Clerk webhook endpoint is registered (needs a tunnel for localhost). Local dev self-heals the current user's row via `profile.me`, so the flow still works without it.
- **No automated browser E2E.** The interactive sign-up→role→edit loop is verified by hand + by layer (types, persistence round-trip, signed-webhook test). `@clerk/testing` + Playwright is a candidate follow-up.
- **Avatar is a URL field, not an upload.** Real image upload waits on Cloudflare R2 (Phase 1). Avatars otherwise come from Clerk via the sync.
- **Recruiter org**: onboarding creates a *Clerk* organization; the local `Organization`/`OrgMembership` rows only appear once the Clerk webhook runs (so the recruiter profile shows a placeholder org name until then). Requires Clerk **Organizations** enabled in the dashboard.
- **Schema covers Phases 0–2.** PRD §8 entities now present: identity/profile (P0), Session/RecordingConsent (P1), Transcript/Score (P2). Still absent until their phase: Scenario, Showcase, Shortlist, Notification, Report, MatchRequest — add via expand-then-contract migrations.
- **Phase 2 live round-trip not yet run with real keys** (verified by layer + deterministic calibration). See the Phase 2 status note for the manual check.
- **Phase 2 deferred TODOs:** `score/created` has no consumer (Resend + in-app notification = Phase 6); scoring runs real-time only (Batch reprocessing/backfill = later cost optimization); rubric calibration is local/manual, not a CI gate yet (PRD §6.4 wants ~30 reps in CI — we have 3); per-scenario weighting is built but unwired (Phase 3); rep view is seller-only (counterpart/recruiter access later); dispute/flag flow (FR-24) = Phase 6; seller-speaker identification is LLM-inferred (per-participant track egress would make it exact — Phase 1 change).
- **Open schema choices** (owner deferred): `OrgRole` follows the PRD (`recruiter|manager|admin`, no `practitioner`); `User.primaryTrack` is an extra field beyond PRD §8.
- **`docs/cost-and-pricing.md` is referenced but missing.**
- **Sidebar nav** shows later-phase items (Roleplays, AI Training, Candidates) as disabled "Soon" — visual only, not wired.

---

## Phase 3 (Matchmaking) — what it needs (do NOT build yet)

- **Scenario library first** (PRD FR-6–FR-8): add the `Scenario` table (`track`, `difficulty`, `title`, `context`, `seller_objective`, `counterpart_persona`, `duration_s`, `rubric_weights_json`, `version`, `active`) + admin CRUD. Then **wire `getScenarioWeights(scenario.track)` / `scenario.rubric_weights_json` into the scoring `aggregate()` call** in `@sr/jobs` (the presets + resolver already exist in `@sr/core`), and pass the scenario brief into `buildScoringPrompt` (the `scenarioBrief` param is already plumbed). Populate `Session.scenarioId/scenarioVersion`.
- **`MatchRequest` table** (PRD §8) + **Upstash Redis** queue/presence (`UPSTASH_REDIS_REST_URL`/`_TOKEN` — add to `@sr/config` + `.env.example`); pairing logic (complementary roles, similar level, not recently matched); lobby + brief reveal + Ready gating (FR-9–FR-12); no-show handling.
- Matchmaking creates the `Session` (today the host creates it directly in `roleplay.createSession`); the rest of the call→record→score pipeline is unchanged and already works.
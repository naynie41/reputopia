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

**Phase 0 — Foundations: ✅ COMPLETE.** Acceptance met: a user can sign up, pick a role (practitioner or recruiter/manager), and edit a profile. Verified via lint/typecheck/build + a DB persistence round-trip + a signed-webhook→DB test against the Neon dev branch.

**Next: Phase 1 (Live call MVP, LiveKit). Do NOT start it unless asked.** Build only what the current phase calls for.

What exists after Phase 0: pnpm monorepo; Next.js App Router app with an authenticated sidebar shell; Clerk auth (orgs + roles) with sign-in/up, first-login role selection, and a `/api/webhooks/clerk` sync; Prisma schema + migration on Neon for the identity/profile entities; tRPC for all reads/writes; practitioner + recruiter profile pages; `/api/health`.

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
    api/trpc/[trpc]/                       tRPC fetch handler
    api/webhooks/clerk/                    Clerk->Postgres sync (Svix-verified)
    api/health/                            DB health probe
  src/server/trpc/                         tRPC init (context+procedures), root, routers/
  src/server/users.ts                      getDbUser / ensureDbUser (DB is source of truth)
  src/trpc/                                client.tsx (provider+useTRPC), server.ts (RSC caller), query-client.ts
  src/components/ui/                        shadcn-style primitives (button, input, card, badge, avatar, …)
/packages/config              (@sr/config) zod env schema (env.server/env.client), shared eslint + tsconfig base
/packages/core                (@sr/core)   shared enums + domain zod schemas (profile, onboarding)
/packages/db                  (@sr/db)     Prisma 7 schema, prisma.config.ts, generated/ client, src/index.ts singleton, seed
/packages/jobs                             PLACEHOLDER (README only, no package.json) — Inngest, Phase 2+
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

## Known gaps / deferred (as of end of Phase 0)

Tracked here so a future session doesn't mistake these for bugs:

- **Repo is not under git yet.** No commits exist. `git init` + an initial commit is pending the owner's go-ahead.
- **`CLERK_WEBHOOK_SIGNING_SECRET` is a placeholder** in local `.env`. Live Clerk→Postgres sync is inactive until it's set and a Clerk webhook endpoint is registered (needs a tunnel for localhost). Local dev self-heals the current user's row via `profile.me`, so the flow still works without it.
- **No automated browser E2E.** The interactive sign-up→role→edit loop is verified by hand + by layer (types, persistence round-trip, signed-webhook test). `@clerk/testing` + Playwright is a candidate follow-up.
- **Avatar is a URL field, not an upload.** Real image upload waits on Cloudflare R2 (Phase 1). Avatars otherwise come from Clerk via the sync.
- **Recruiter org**: onboarding creates a *Clerk* organization; the local `Organization`/`OrgMembership` rows only appear once the Clerk webhook runs (so the recruiter profile shows a placeholder org name until then). Requires Clerk **Organizations** enabled in the dashboard.
- **Schema is identity/profile-only.** PRD §8 entities for later phases (Scenario, Session, Transcript, Score, Showcase, Shortlist, Notification, Report, MatchRequest) are intentionally absent — add them in their phase via expand-then-contract migrations.
- **Open schema choices** (owner deferred): `OrgRole` follows the PRD (`recruiter|manager|admin`, no `practitioner`); `User.primaryTrack` is an extra field beyond PRD §8.
- **`docs/cost-and-pricing.md` is referenced but missing.**
- **Sidebar nav** shows later-phase items (Roleplays, AI Training, Candidates) as disabled "Soon" — visual only, not wired.
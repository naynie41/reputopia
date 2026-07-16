# Sales Roleplay

> The **"GitHub for sales reps."** Practice live, scenario-based sales roleplay calls with a peer, get **AI analysis and scoring** against a rubric after every call, and build a **verifiable, skill-based portfolio** that recruiters and managers can trust.

<p>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-end--to--end-3178c6?logo=typescript&logoColor=white">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js">
  <img alt="tRPC" src="https://img.shields.io/badge/tRPC-v11-2596be?logo=trpc&logoColor=white">
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma&logoColor=white">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-workspace-f69220?logo=pnpm&logoColor=white">
</p>

---

## Summary

Sales professionals improve mainly through live reps, but real reps are scarce, high-stakes, and rarely scored objectively — and recruiters have no reliable way to evaluate someone's *actual* selling ability before a hire.

**Sales Roleplay** pairs practitioners for **1:1 video roleplays**, records each call, and scores the seller with a **mix of deterministic metrics and an LLM judge** against an anchored rubric — turning every call into a showcaseable rep.

**Two core loops:**

- **Practitioner** — match → roleplay → AI score → improve → showcase.
- **Recruiter / manager** — browse and filter scored candidates → review recorded reps → shortlist → contact.

Scoring spans four skill tracks — **DM / cold setting, objection handling, discovery, closing** — across eight rubric dimensions (six LLM-judged, two computed from the transcript).

**How it fits together:** a LiveKit call is recorded to Cloudflare R2, then a durable Inngest pipeline runs **AssemblyAI transcription (with speaker diarization) → deterministic metrics → Claude scoring (cached rubric, structured output, evidence required) → persist the score + roll the user's skill profile**. Matchmaking pairs users atomically via Upstash Redis, then sends both through a lobby into the call.

---

## Tech stack

**TypeScript end-to-end**, fully managed / serverless (no Docker in production).

- **Web / API:** Next.js 16 (App Router, Turbopack) · tRPC v11 · TanStack Query · Tailwind v4 + shadcn-style UI
- **Auth:** Clerk (organizations + roles)
- **Database:** PostgreSQL on Neon + Prisma 7
- **Real-time calls:** LiveKit Cloud (WebRTC + Egress recording) → Cloudflare R2 (private, signed URLs)
- **Matchmaking:** Upstash Redis · **Background jobs:** Inngest
- **Transcription:** AssemblyAI · **AI scoring:** Anthropic Claude

Monorepo (pnpm): `apps/web` (app), `packages/core` (domain + scoring logic), `packages/db` (Prisma), `packages/jobs` (Inngest), `packages/config` (env + shared config).

---

## Launch guide

**Prerequisites:** Node ≥ 20, pnpm ≥ 10, and a Neon Postgres database. Full functionality also needs Clerk, LiveKit, Upstash, AssemblyAI, Anthropic, and Cloudflare R2 accounts.

### 1. Install & configure

```bash
pnpm install
cp .env.example .env        # then fill in real values (see below)
```

`.env` is validated at boot by a zod schema in `packages/config` — a missing required var fails fast. Keys, grouped by service (full commented list in [`.env.example`](.env.example)):

| Group | Keys |
|---|---|
| App | `NODE_ENV`, `NEXT_PUBLIC_APP_URL` |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` |
| Neon | `DATABASE_URL` (pooled, `-pooler`), `DIRECT_URL` (direct — migrations only) |
| LiveKit | `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| Scoring | `ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY` |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Inngest | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (optional locally) |

> **Never commit real secrets** — `.env` is gitignored; only `.env.example` (names/placeholders) is tracked. Also enable **Organizations** in the Clerk dashboard.

### 2. Set up the database

```bash
pnpm db:generate           # generate the Prisma client
pnpm db:migrate            # apply migrations to your Neon dev branch
pnpm db:seed               # seed an admin user + the starter scenario library
```

### 3. Run

```bash
pnpm dev                   # → http://localhost:3000
```

For the async scoring jobs, run the Inngest dev server alongside it (needs real `ASSEMBLYAI_API_KEY` + `ANTHROPIC_API_KEY` to actually score):

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest   # dashboard → http://localhost:8288
```

Point a **Clerk webhook** at `/api/webhooks/clerk` (`user.*`, `organization.*`, `organizationMembership.*`) for full user/org sync. In local dev the app self-heals the current user's row, so the webhook is only required for org sync.

---

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | run the web app (Next dev, Turbopack) |
| `pnpm build` | production build |
| `pnpm lint` | ESLint across all packages |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test` | unit tests (Vitest) |
| `pnpm db:generate` | `prisma generate` |
| `pnpm db:migrate` | `prisma migrate dev` (local) |
| `pnpm db:deploy` | `prisma migrate deploy` (CI/prod) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:seed` | idempotent seed (admin + scenario library) |
| `pnpm format` | Prettier |

Run `pnpm lint` and `pnpm typecheck` before considering work done.

---

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — product spec, user roles, the AI scoring system, and data model.
- [`docs/devops-handover.md`](docs/devops-handover.md) — environments, CI/CD, secrets, webhooks, observability, runbooks.

## License

Private and proprietary. All rights reserved.

# Sales Roleplay

Live sales roleplay calls, AI scoring, and a showcase portfolio. See [`docs/PRD.md`](docs/PRD.md),
[`docs/CLAUDE.md`](docs/CLAUDE.md), and [`docs/devops-handover.md`](docs/devops-handover.md).

**Status: Foundations.** A user can sign up, pick a role (practitioner or
recruiter/manager), and edit a profile. Nothing beyond that is built yet.

## Stack 

- **pnpm monorepo** · TypeScript end-to-end
- **apps/web** — Next.js 16 (App Router, Turbopack) + Tailwind v4 + shadcn-style UI
- **tRPC v11** (`@trpc/tanstack-react-query`) + TanStack Query
- **Clerk v7** auth (organizations + roles)
- **Prisma 7** + **Neon** Postgres (pooled runtime, direct migrations, Neon driver adapter)

## Layout

```
apps/web         Next.js app (UI + tRPC + webhooks + health)
packages/config  zod env schema, shared eslint/tsconfig
packages/core    shared enums + domain (zod) schemas
packages/db      Prisma schema, generated client, migrations
packages/jobs    placeholder (Inngest, Phase 2+)
```

## Getting started

1. Install deps: `pnpm install`
2. Copy env: `cp .env.example .env`, then fill in real values:
   - **Clerk** keys + webhook secret (enable Organizations in the Clerk dashboard).
   - **Neon** `DATABASE_URL` (pooled, has `-pooler`) and `DIRECT_URL` (direct).
3. Generate the client + create the schema:
   - `pnpm db:generate`
   - `pnpm db:migrate` (needs a real Neon DB)
4. Run it: `pnpm dev` → http://localhost:3000

### Clerk webhook (user/org sync)

Point a Clerk webhook at `/api/webhooks/clerk` (events: `user.*`, `organization.*`,
`organizationMembership.*`) and set `CLERK_WEBHOOK_SIGNING_SECRET`. In local dev the app
self-heals the current user's row, so the webhook is only required for full org sync.

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | run the web app |
| `pnpm build` | production build |
| `pnpm lint` | ESLint (all packages) |
| `pnpm typecheck` | `tsc --noEmit` (all packages) |
| `pnpm test` | unit tests (Vitest) |
| `pnpm db:migrate` | `prisma migrate dev` (local) |
| `pnpm db:deploy` | `prisma migrate deploy` (CI/prod) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:seed` | idempotent seed (no-op in Phase 0) |

Always run `pnpm lint` and `pnpm typecheck` before considering work done.

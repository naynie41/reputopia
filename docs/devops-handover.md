# Sales Roleplay — DevOps & Deployment Handover

**Companion to:** Sales Roleplay PRD + Cost/Pricing doc
**Audience:** DevOps / Platform Engineer
**Date:** June 2026

---

## 0. Read this first — shape of the system

This is a **serverless / managed-PaaS** architecture, not a server-or-Kubernetes deployment. There are **no VMs, containers, or clusters to operate** in v1. Your job is platform engineering, not box-wrangling:

- **CI/CD** (GitHub Actions + Vercel) and environment promotion.
- **Secrets management** across providers.
- **Database lifecycle** (migrations, branching, backups, pooling).
- **Webhook wiring** between LiveKit / Clerk / Inngest / the app.
- **Observability, alerting, and runbooks.**
- **Security, data-retention, and compliance** (we store recorded calls of real people — this is the highest-risk area).

Compute is Vercel (functions auto-scale) + Inngest (durable jobs). Media is LiveKit Cloud. If volume later forces self-hosting LiveKit, that's the one place real infra-ops appears — out of scope for v1, flagged in §11.

---

## 1. Service inventory

| Concern | Service | Managed? | Ops responsibility |
|---|---|---|---|
| Hosting / app + API | **Vercel** | Yes | Project config, domains, env vars, deploy protection |
| Database (Postgres) | **Neon** | Yes | Branching, migrations, pooling, PITR/backups |
| Auth + orgs/roles | **Clerk** | Yes | Webhook → user sync, env keys, MFA policy |
| Real-time video + recording | **LiveKit Cloud** | Yes | Project keys, Egress config, webhooks, region |
| Matchmaking queue / rate-limit | **Upstash Redis** | Yes | REST keys, region, eviction policy |
| Background jobs | **Inngest** | Yes | Serve endpoint, signing keys, concurrency/throttle |
| Transcription | **AssemblyAI** | API | API key, rate limits, webhook (optional) |
| AI scoring | **Anthropic Claude API** | API | API key, rate limits, batch queue |
| Object storage (recordings) | **Cloudflare R2** | Yes | Bucket policy, signed URLs, lifecycle rules |
| Transactional email | **Resend** | Yes | API key, domain DNS (SPF/DKIM/DMARC) |
| Error/perf monitoring | **Sentry** | Yes | DSN, source maps, alert rules |
| Product analytics | **PostHog** | Yes | Project key, host |
| DNS / WAF / CDN | **Cloudflare** | Yes | DNS, proxy, WAF, rate limits |

> **Action:** create an **organization/team account** for each (not personal logins), enforce **2FA**, and add the DevOps engineer + a break-glass account to each. Maintain a single source-of-truth access list (e.g. in 1Password/Vault).

---

## 2. Environments

| Environment | Purpose | App | DB | LiveKit | Clerk | Trigger |
|---|---|---|---|---|---|---|
| **Local** | Dev | localhost | Neon dev branch (or local PG) | LiveKit dev project | Clerk dev instance | manual |
| **Preview** | Per-PR review | Vercel preview URL | **Neon branch per PR** | dev project | dev instance | open/update PR |
| **Staging** | Prod-like QA | staging.salesroleplay.app | Neon staging branch | LiveKit staging project | Clerk staging | merge to `main` |
| **Production** | Live | app.salesroleplay.app | Neon prod (primary) | LiveKit prod project | Clerk prod | tagged release / promote |

Principles: **prod isolation** (separate projects + keys per env, never shared), **ephemeral previews** (Neon branch auto-created/destroyed with the PR), and **promotion** from staging → prod via an approved release, not direct pushes.

---

## 3. Repository & branching

**Monorepo** (recommended) with a package manager workspace (pnpm). Suggested layout:

```
/apps
  /web            # Next.js app (UI + API route handlers + tRPC)
/packages
  /db             # Prisma schema, migrations, client
  /jobs           # Inngest functions (transcription, scoring, notifications, GDPR)
  /core           # shared domain logic, rubric, scoring contracts
  /config         # eslint, tsconfig, shared env schema (zod)
/infra
  /terraform      # Cloudflare DNS, R2 buckets, (optional) Upstash — see §4
  /github         # reusable workflows
.env.example      # committed; real .env never committed
```

**Branching:** trunk-based. `main` is always deployable. Short-lived feature branches → PR → preview → review → merge. Releases cut from `main` as tags (`vX.Y.Z`) and promoted to prod. **Protect `main`**: require PR, passing CI, 1+ review, no force-push.

---

## 4. Infrastructure-as-Code

Most providers are configured via dashboard, but codify what supports it so environments are reproducible:

- **Terraform** for: Cloudflare (DNS records, WAF rules, page rules), Cloudflare R2 buckets + lifecycle policies, and Upstash Redis databases (Terraform provider available).
- **Vercel + Neon**: managed via their dashboards / CLIs and GitHub integrations; capture config in `vercel.json` and document non-IaC settings in `/infra/README.md`.
- **Everything else** (Clerk, LiveKit, AssemblyAI, Anthropic, Resend, Sentry, PostHog): dashboard config + documented runbook (these don't have mature Terraform providers; keep a written "how this project is configured" doc).

State: store Terraform state remotely (Terraform Cloud or an R2/S3 backend) with locking. Never commit state or secrets.

---

## 5. CI/CD pipeline (GitHub Actions + Vercel)

### Pull request (per push to a PR)
1. **Install** (pnpm, cached).
2. **Lint** (ESLint) + **format check** (Prettier).
3. **Typecheck** (`tsc --noEmit`).
4. **Prisma validate** + generate; check migrations are present for schema changes.
5. **Unit/integration tests** (Vitest/Jest).
6. **Build** the Next.js app.
7. **Create Neon branch** for the PR; run migrations against it.
8. **Vercel preview deploy** wired to that Neon branch (preview env vars).
9. (Optional) **E2E smoke** (Playwright) against the preview URL.
10. Post preview URL + checks to the PR.

### Merge to `main` (staging) → promote to production
1. Re-run CI gates.
2. **Run DB migrations** against the target branch (`prisma migrate deploy`) using the **direct (non-pooled) connection**.
3. **Deploy** via Vercel (staging on merge; prod on tagged release or manual promote with required reviewer).
4. **Sync Inngest functions** (Inngest auto-discovers via the serve endpoint on deploy; verify in dashboard).
5. **Upload Sentry source maps** + create a release; tag the deploy with the git SHA.
6. **Post-deploy smoke test** (health endpoint + a synthetic end-to-end call test in staging).
7. **Notify** Slack channel with release notes.

### Rollback
- **App:** Vercel **instant rollback** to the previous deployment (one click / CLI).
- **DB:** migrations must be **backward-compatible** (expand-then-contract pattern: deploy additive migration → deploy code → later remove old columns). Never write a migration that a rolled-back app version can't run against. Keep a tested down-migration or a Neon PITR restore as the escape hatch.

**Use GitHub Environments** with required reviewers + environment-scoped secrets for `staging` and `production`.

---

## 6. Secrets & environment variables

Store secrets in **Vercel project env vars** (scoped per environment) and **GitHub Actions secrets** (for CI). Commit a `.env.example` with keys-only (no values). Validate at boot with a **zod env schema** so a missing var fails fast.

| Group | Variable | Scope | Notes |
|---|---|---|---|
| App | `NEXT_PUBLIC_APP_URL`, `NODE_ENV` | all | public URL per env |
| Clerk | `CLERK_SECRET_KEY` | server | per env (test vs live) |
| | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | public | |
| | `CLERK_WEBHOOK_SIGNING_SECRET` | server | verify Svix signature |
| Neon | `DATABASE_URL` | server | **pooled** connection (app runtime) |
| | `DIRECT_URL` | server/CI | **direct** connection (migrations) |
| LiveKit | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | server | sign room tokens + verify webhooks |
| | `NEXT_PUBLIC_LIVEKIT_URL` | public | `wss://...` |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | server | queue + rate limiting |
| Inngest | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | server | |
| AssemblyAI | `ASSEMBLYAI_API_KEY` | server | |
| Anthropic | `ANTHROPIC_API_KEY` | server | scoring; consider a separate key per env for cost tracking |
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | server | private bucket |
| Resend | `RESEND_API_KEY` | server | |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN` | public | |
| | `SENTRY_AUTH_TOKEN` | CI | source-map upload only |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | public | |

**Rotation:** quarterly, and immediately on suspected exposure. Document a rotation runbook (§13). **Least privilege:** scope R2 keys to the single bucket; use per-env API keys where the vendor supports it (Anthropic/AssemblyAI/LiveKit) for clean cost attribution and blast-radius control. Enable **GitHub secret scanning + push protection** on the repo.

---

## 7. Database (Neon + Prisma)

- **Connections:** serverless functions exhaust DB connections fast. Use the **Neon pooled connection** (`DATABASE_URL`) at runtime and the **direct connection** (`DIRECT_URL`) only for migrations. Configure Prisma accordingly.
- **Migrations:** `prisma migrate deploy` runs in CI on merge/release, never automatically from app boot. Migrations are reviewed in PRs.
- **Branching:** every PR gets a Neon branch (copy-on-write, instant) seeded from staging-like data; destroyed on merge/close.
- **Backups / PITR:** enable Neon point-in-time restore; set retention to your RPO (recommend ≥ 7 days). Treat Neon branches as fast restore points.
- **Seeding:** maintain an idempotent seed script (scenarios, rubric versions, an admin user) for non-prod envs.

---

## 8. Webhooks (must be wired and verified)

These are critical glue. Each must verify its signature and be **idempotent** (dedupe on event ID).

| Source | Endpoint (app route) | Events | Action | Verification |
|---|---|---|---|---|
| **Clerk** | `/api/webhooks/clerk` | `user.created/updated/deleted`, org + membership events | Sync User/Org/Membership rows | Svix signature (`CLERK_WEBHOOK_SIGNING_SECRET`) |
| **LiveKit** | `/api/webhooks/livekit` | `room_finished`, `egress_ended`, participant join/leave | Emit `session.ended` → Inngest; record `recording_url` | LiveKit HMAC (API key/secret) |
| **Inngest** | `/api/inngest` | (serve endpoint) | Hosts all job functions | Inngest signing key |
| **Resend** (optional) | `/api/webhooks/resend` | bounces/complaints | Suppress + flag bad addresses | Resend signature |

> **Design rule:** webhooks do *minimal* work — verify, persist, enqueue. **No transcription/scoring in the request handler** (it will time out). The LiveKit webhook only emits an event; Inngest does the heavy, retried pipeline.

---

## 9. The async pipeline (what Inngest runs)

Durable, retried, idempotent functions:

1. **`session.ended`** → submit recording (R2 URL) to AssemblyAI (batch, diarized).
2. **`transcript.ready`** → compute deterministic metrics → call Claude (Sonnet 4.6, **Batch API**, **cached rubric prompt**) → persist `Score`, update `SkillProfile`.
3. **`score.created`** → send notification (Resend + in-app).
4. **`user.deletion_requested`** (GDPR) → hard-delete recordings (R2), transcripts, scores; confirm.

Configure **concurrency limits + throttling** per function to respect AssemblyAI and Anthropic rate limits, and a **dead-letter / failure handler** that alerts + allows replay. Cap retries; surface a "scoring failed, retry" state to the user after exhaustion.

---

## 10. Observability & alerting

| Layer | Tool | What |
|---|---|---|
| Errors + performance | **Sentry** | Client + server exceptions, traces, release health |
| App/function logs | **Vercel logs** → **log drain** (Axiom / Better Stack / Datadog) | Retention beyond Vercel's window; searchable |
| Jobs | **Inngest dashboard** | Run status, retries, failures, replays |
| Call quality | **LiveKit Cloud observability** | Per-session latency/quality, egress status |
| Uptime / synthetic | **Better Stack / UptimeRobot** | `/api/health` + a synthetic "create room + join + end" check |
| Product analytics | **PostHog** | Funnels, retention, feature usage |
| Cost | Vendor budget alerts (§12) | Spend anomalies |

**Health endpoint:** `/api/health` checks DB, Redis, and a lightweight LiveKit/Anthropic reachability ping.
**Alert routing:** Sentry + uptime + Inngest failures → **Slack** (warning) and **PagerDuty/on-call** (critical: prod down, scoring backlog, DB unavailable). Define **SLOs**: API availability ≥ 99.9%, scoring p95 < 6 min, call connection success ≥ 95%.

---

## 11. Scaling notes

- **Vercel functions** auto-scale; keep handlers fast (offload to Inngest). Mind function duration/timeout limits — never block on transcription/scoring.
- **Neon** autoscaling + scale-to-zero on non-prod; set **max autoscaling limits** as a cost ceiling. Pooled connections are mandatory at scale.
- **LiveKit Cloud** scales transparently; start on **Ship**, move to **Scale** as minutes grow. **Self-hosting the open-source LiveKit server** becomes worthwhile only at high, sustained volume (this is the one future workstream that introduces container/K8s ops — out of scope for v1).
- **Inngest** concurrency caps protect downstream API rate limits; tune throttle as call volume rises.
- **Upstash** scales automatically; watch request counts for the matchmaking queue.

---

## 12. Cost monitoring

- Set **budget alerts** on: Anthropic, AssemblyAI, LiveKit, Vercel, Neon (these are the ones that move with usage).
- Use **per-environment API keys** so staging/test spend is visible separately from prod.
- Alert at, e.g., 50/80/100% of monthly budget. The dominant variable cost is **LiveKit minutes**, then transcription — watch those first. (See the Cost/Pricing doc for the unit model.)

---

## 13. Security

- **Secrets:** never in repo; Vercel/GitHub encrypted stores; quarterly rotation; documented rotation runbook; GitHub secret scanning + push protection on.
- **Least-privilege keys:** R2 keys scoped to the one bucket; separate keys per env.
- **Recordings:** **private R2 bucket**, no public listing; serve via **short-lived signed URLs** only; authorize at the app layer (a recruiter can fetch only reps a practitioner explicitly *showcased*).
- **Transport/at-rest:** TLS everywhere (Cloudflare/Vercel/LiveKit enforce); R2 and Neon encrypt at rest.
- **Authorization:** enforce row-level access in the app/tRPC layer for every rep/score/profile read.
- **Rate limiting:** Upstash Ratelimit on auth, matchmaking, scoring-trigger, and webhook endpoints.
- **Edge protection:** Cloudflare proxy + WAF + bot/DDoS rules in front of the app domain.
- **Headers:** strict CSP, HSTS, X-Frame-Options, etc. (Next.js config / middleware).
- **Supply chain:** Dependabot/Renovate for updates; CodeQL (SAST) on PRs; lockfile integrity.
- **Consent:** recording consent is enforced in-product (per PRD); keep the consent text + version auditable.

---

## 14. Data, retention & compliance (highest-risk area — recorded calls of real people)

- **Retention policy:** define how long recordings/transcripts are kept; apply **R2 lifecycle rules** to expire raw recordings after the policy window (scores/feedback can outlive the raw media).
- **Delete pipeline:** user-initiated delete and account deletion trigger the **`user.deletion_requested`** Inngest job → hard-delete R2 objects + transcripts + scores (cascade), with confirmation. This must be reliable and auditable.
- **Export:** GDPR-style data export job (user's reps, scores, profile).
- **Data residency:** choose **Neon, LiveKit, and R2 regions** deliberately. **Clerk stores user data in the US** — flag this if EU residency is ever required (alternative: Neon Auth / Supabase Auth).
- **Subprocessors:** maintain a subprocessor list and sign DPAs with each vendor (LiveKit, AssemblyAI, Anthropic, Clerk, etc.). LiveKit Scale tier offers HIPAA eligibility if ever needed.
- **Backups contain PII:** Neon PITR + R2 versions hold personal data — same retention/delete discipline applies.

---

## 15. Backup & disaster recovery

- **Targets (recommend):** RPO ≤ 1 hour (Neon PITR), RTO ≤ 4 hours for full prod restore.
- **Database:** Neon PITR + branch snapshots; **run a quarterly restore drill** and document the result.
- **Recordings:** enable **R2 object versioning**; optional secondary backup bucket for critical media.
- **Config reproducibility:** Terraform (§4) + the written config runbook mean a clean re-provision is possible.
- **Vendor outage:** document degraded-mode behavior — if AssemblyAI/Anthropic is down, calls still happen and scoring **queues and retries** (the pipeline is async by design, so a transcription/LLM outage delays scores, it doesn't drop calls).

---

## 16. Runbooks (starter set)

Write these as living docs; here are the must-haves:

1. **Scoring backlog / job failures** — check Inngest failures + AssemblyAI/Anthropic status pages + rate-limit errors; inspect dead-letter; replay after fix.
2. **Call drops / poor quality** — check LiveKit status + per-session observability + region; verify TURN/connectivity.
3. **DB connection exhaustion** — confirm pooled connection in use; raise Neon autoscaling limit; check for a runaway query.
4. **Webhook failures** — verify signing secret, signature check, and idempotency; replay missed events from the source dashboard.
5. **Secret rotation** — step-by-step per provider; rotate → update Vercel/GitHub → redeploy → verify → revoke old.
6. **Prod rollback** — Vercel instant rollback; assess DB migration compatibility; PITR if needed.
7. **Suspected data breach** — contain, rotate keys, assess scope, follow disclosure obligations.

---

## 17. DevOps onboarding checklist

- [ ] Org/team accounts created for every service in §1; 2FA enforced; access list recorded; break-glass account stored.
- [ ] GitHub: branch protection on `main`, secret scanning + push protection, Dependabot/Renovate, CodeQL.
- [ ] GitHub Environments (`staging`, `production`) with required reviewers + scoped secrets.
- [ ] Vercel projects + custom domains (`app.` prod, `staging.`) + deploy protection.
- [ ] Neon: prod + staging branches, pooled + direct connection strings, PITR enabled, autoscaling caps set.
- [ ] Clerk: prod + staging instances, webhook configured + verified, MFA policy.
- [ ] LiveKit: prod + staging projects, Egress configured to R2, webhook configured + verified.
- [ ] R2: private bucket(s), scoped keys, lifecycle + versioning rules, signed-URL flow tested.
- [ ] Upstash, Inngest, AssemblyAI, Anthropic, Resend, Sentry, PostHog: provisioned per env, keys in Vercel/GitHub.
- [ ] Cloudflare: DNS, proxy, WAF, rate-limit rules; Resend domain (SPF/DKIM/DMARC) verified.
- [ ] CI/CD pipeline green end-to-end; preview → staging → prod promotion tested.
- [ ] Observability: Sentry + log drain + uptime + Inngest alerts → Slack/PagerDuty; SLOs defined.
- [ ] Budget alerts on the usage-based vendors.
- [ ] Backup restore drill completed; GDPR delete pipeline tested with a throwaway account.
- [ ] Synthetic end-to-end test in staging (create room → 2 participants → end → recording → transcript → score → notification).

---

## 18. Architecture topology (textual)

```
                         Cloudflare (DNS / WAF / CDN)
                                    │
                          app.salesroleplay.app
                                    │
                          ┌──────── Vercel ────────┐
                          │  Next.js (UI + API)    │
                          │  tRPC · webhooks · health
                          └──┬─────────┬────────┬──┘
        Clerk (auth) ───────┘         │        └────── Upstash Redis (queue + ratelimit)
                                      │
                  ┌───────────────────┼───────────────────────┐
                  │                   │                        │
            Neon Postgres       LiveKit Cloud             Inngest (jobs)
            (Prisma, pooled)    (WebRTC + Egress)               │
                                      │            ┌────────────┼─────────────┐
                                      └─ recording ▶ R2     AssemblyAI    Anthropic
                                                   storage  (transcribe)  (score, Batch)
                                                                              │
                                                                          Resend (email)

   Observability spans all: Sentry · Vercel log drain · LiveKit obs · Inngest dash · PostHog · Uptime
```

---

*Hand-off note: this doc plus the PRD (architecture/data model) and the Cost/Pricing doc (unit economics + budget alert targets) are the three references the DevOps engineer needs. Keep all three versioned in the repo under `/docs`.*
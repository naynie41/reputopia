# Sales Roleplay — Product Requirements Document (PRD)

**Product:** Sales Roleplay
**Type:** Desktop web application
**Version:** v1.0 (PRD draft)
**Date:** June 2026
**Owner:** [You]
**Build approach:** Developed with Claude Code (TypeScript end-to-end stack)

---

## 1. Overview

### 1.1 Problem
Sales professionals and SDRs/BDRs improve mainly through live reps, but real reps are scarce, high-stakes, and rarely scored objectively. Recruiters and sales managers, meanwhile, have no reliable way to evaluate a candidate's *actual* selling ability before a hire — resumes and interviews don't show how someone runs a discovery call or handles an objection live.

### 1.2 Solution
Sales Roleplay is a desktop web app where sales professionals match with peers for **live, scenario-based roleplay calls**, get **AI analysis and scoring** after every call, and build a **showcase portfolio** of recorded reps and feedback. Recruiters and managers get **dashboards** to discover and filter candidates by demonstrated skill.

### 1.3 Vision
Become the "GitHub for sales reps" — a verifiable, skill-based track record that candidates own and recruiters trust.

### 1.4 Core value loops
- **Practitioner loop:** match → roleplay → AI score → improve → showcase.
- **Recruiter loop:** browse/filter scored candidates → review recorded reps → shortlist → contact.

---

## 2. Goals & Success Metrics

| Goal | Metric | v1 target |
|---|---|---|
| Drive repeat practice | Roleplays completed per active user / week | ≥ 3 |
| Make scoring trusted | % of users who rate AI score "fair/accurate" | ≥ 70% |
| Liquidity in matching | Median time-to-match in queue | < 90s during peak |
| Recruiter value | % of recruiters who shortlist ≥1 candidate / session | ≥ 40% |
| Retention | Week-4 practitioner retention | ≥ 25% |
| Quality of calls | % calls completing without a connection drop | ≥ 95% |

**Non-goals for v1:** mobile-native apps, AI-played opponents (human-to-human only at launch), payments/marketplace, multi-language scoring.

---

## 3. User Roles & Personas

1. **Practitioner (Seller)** — SDR/AE/recruiter-in-training practicing skills, wanting feedback and a portfolio.
2. **Practitioner (Counterpart/Buyer)** — same user pool, taking the "prospect" role in a given session (assigned a persona brief).
3. **Recruiter / Hiring Manager** — evaluates candidates; browses, filters, reviews recordings, shortlists. Belongs to an **organization**.
4. **Sales Manager / Coach** — like a recruiter but focused on coaching their own team (views team dashboards, assigns drills).
5. **Admin** — internal: manage scenarios, rubrics, moderation, user reports.

> **Assumption:** Every practitioner can play both seller and counterpart roles. Scoring focuses on the seller in each call; the counterpart can optionally be rated for "realism/effort" to keep quality high.

---

## 4. Scope

### In scope (v1)
- Account creation, profiles, role selection (practitioner vs recruiter/manager org).
- Scenario library across four skill tracks: **DM/Cold Setting, Objection Handling, Discovery, Closing**.
- Real-time matchmaking + live 1:1 video roleplay calls with recording.
- Post-call AI transcription, analysis, and scoring against a rubric.
- Practitioner profile/portfolio with shareable showcase reps.
- Recruiter/manager dashboard with candidate filtering by skill scores.
- Notifications (email + in-app).

### Out of scope (v1, candidates for v2+)
- AI opponent (bot-played counterpart).
- Group/team roleplays (>2 participants).
- Native mobile apps.
- In-app messaging/marketplace/payments.
- Live in-call AI coaching (real-time hints).

---

## 5. Functional Requirements

### 5.1 Onboarding & Profiles
- **FR-1** Email + OAuth (Google/LinkedIn) sign-up; LinkedIn is high-value for sales credibility.
- **FR-2** On first login, user picks a track: *Practitioner* or *Recruiter/Manager* (recruiter flow creates/joins an organization).
- **FR-3** Practitioner profile: name, headline, target role (SDR/AE/etc.), experience level, industries, avatar, skill-score summary, showcase reps.
- **FR-4** Recruiter profile: org, role, saved searches, shortlists.
- **FR-5** Privacy controls: each rep is **private by default**; user explicitly toggles a rep to **showcase (visible to recruiters)** or **public link**.

### 5.2 Scenario Library
- **FR-6** Each scenario has: track (one of four skills), difficulty (1–3), title, context brief, **seller objective**, **counterpart persona brief** (only shown to whoever is assigned the counterpart role), recommended duration, and the rubric weighting to apply.
- **FR-7** Admins can CRUD scenarios; scenarios are versioned (a completed call records the scenario version used).
- **FR-8** Users can filter scenarios by track and difficulty, and start a queue for a chosen scenario (or "any in this track").

### 5.3 Matchmaking
- **FR-9** A user enters a matchmaking queue for a track/scenario; they declare a preferred role (seller / counterpart / either).
- **FR-10** The system pairs two compatible users (complementary roles, similar difficulty/level, not recently matched together) and assigns roles + scenario.
- **FR-11** On match, both users get a lobby with: countdown, role + brief reveal (seller sees objective; counterpart sees persona), and "Ready" gating.
- **FR-12** Timeout/abandon handling: if a match isn't accepted within N seconds, re-queue both users; track no-shows for reputation.
- **FR-13** Fallback when liquidity is low: scheduled rooms (book a slot) and "practice solo" placeholder (records a monologue pitch for scoring) — *flag: solo mode is stretch.*

### 5.4 Live Roleplay Call
- **FR-14** 1:1 WebRTC video/audio call with device selection (camera/mic), connection-quality indicator, and mute/cam controls.
- **FR-15** In-call timer matching scenario duration; soft warning at T-60s.
- **FR-16** Either participant can end the call; both are routed to a post-call screen.
- **FR-17** The call is **recorded** (audio mandatory for scoring; video optional/configurable) and stored against the session.
- **FR-18** Consent: both users must accept a recording notice before the first call; per-call indicator that recording is active.
- **FR-19** Live captions during the call (nice-to-have; can ship in v1.1).

### 5.5 AI Analysis & Scoring (the core differentiator — see §6)
- **FR-20** After call end, the recording is transcribed with **speaker diarization** (who said what).
- **FR-21** An AI scoring job runs against the scenario's rubric and produces: per-dimension scores, an overall score, strengths, growth areas, and timestamped "moments" (good/missed).
- **FR-22** Results are written to the session and reflected in the practitioner's rolling skill scores.
- **FR-23** Scoring is **asynchronous**; user sees a "analysis in progress" state and gets notified when ready (target < 3 min after call end).
- **FR-24** Users can dispute/flag a score; flagged scores feed rubric QA.

### 5.6 Practitioner Dashboard & Portfolio
- **FR-25** "My Reps" list: every session with scenario, role, date, score, status.
- **FR-26** Rep detail view: video/audio playback synced to transcript, AI feedback, timestamped moments, rubric breakdown.
- **FR-27** Skill profile: rolling scores per track (Discovery/Objection/DM/Closing), trend over time, total reps.
- **FR-28** Showcase: pick best reps to feature; generate a shareable public profile link for recruiters.

### 5.7 Recruiter / Manager Dashboard
- **FR-29** Candidate search with **filters by skill scores** (e.g., Objection Handling ≥ 80), track, experience, recency, availability.
- **FR-30** Candidate card: skill summary, top showcased reps, trend.
- **FR-31** Review a candidate's showcased rep (playback + AI feedback) without contacting them.
- **FR-32** Shortlists/saved searches; export shortlist (CSV) in v1.
- **FR-33** Manager mode: view *own team* aggregate dashboard, drill into individual reps, assign a scenario as a "drill."
- **FR-34** Access control: recruiters only ever see reps a practitioner has explicitly showcased.

### 5.8 Notifications
- **FR-35** In-app + email for: match found, analysis ready, recruiter viewed your profile (opt-in), drill assigned.

---

## 6. AI Scoring System (detailed spec)

This is the heart of the product, so it gets its own spec.

### 6.1 Rubric model
Scoring is **rubric-driven and scenario-weighted**. Define a base set of dimensions; each scenario assigns weights so a "Closing" scenario emphasizes closing dimensions, etc.

**Core dimensions (0–100 each):**
| Dimension | What it measures |
|---|---|
| Discovery quality | Open questions, uncovering pain, qualifying (e.g., budget/authority/need/timeline) |
| Objection handling | Acknowledge → clarify → respond → confirm; doesn't get defensive |
| DM/Cold setting | Pattern interrupt, value framing, securing the next step |
| Closing | Clear ask, urgency, handling hesitation, locking commitment |
| Rapport & active listening | Reflecting, not interrupting, empathy |
| Communication & clarity | Concision, structure, jargon control |
| Talk/listen ratio | Quantitative: seller talk-time % (penalize monologuing) |
| Filler & pace | Filler-word rate, words-per-minute band |

> Some dimensions are **deterministic** (talk/listen ratio, filler rate, WPM) and computed from the diarized transcript without an LLM. The rest are **LLM-judged** against rubric anchors. Mixing the two raises trust and cuts cost.

### 6.2 Scoring pipeline
1. **Transcribe** the recording with speaker diarization + (optional) sentiment.
2. **Compute deterministic metrics** from the transcript (talk ratio, filler rate, pace, longest monologue).
3. **LLM scoring call**: send the rubric (cached system prompt), the scenario brief, the deterministic metrics, and the diarized transcript; request structured JSON with per-dimension score + evidence (quoted turn indices) + timestamped moments.
4. **Aggregate**: apply scenario weights → overall score; map to the four track scores.
5. **Persist + notify.**

### 6.3 Output contract (structured JSON)
```json
{
  "overall_score": 0,
  "dimensions": [
    { "key": "discovery", "score": 0, "weight": 0.0,
      "evidence": ["turn_12", "turn_34"], "comment": "" }
  ],
  "strengths": [""],
  "growth_areas": [""],
  "moments": [
    { "t_start_s": 0, "t_end_s": 0, "label": "good|missed",
      "dimension": "objection", "note": "" }
  ],
  "deterministic": { "seller_talk_pct": 0, "filler_per_min": 0, "wpm": 0 }
}
```

### 6.4 Trust & calibration
- **Anchored rubric:** each dimension defines concrete 0/50/100 behavioral anchors so the LLM scores consistently.
- **Evidence required:** every score must cite transcript turns; surfaced to the user for "show me why."
- **Calibration set:** maintain ~30 hand-scored reference reps; run them in CI when the rubric/model changes to catch score drift.
- **Dispute loop:** flagged scores reviewed; systematic errors fix the rubric, not one-off overrides.

> **Note:** v1 scores the **seller only**. The counterpart's persona effort can get a lightweight thumbs rating from the seller to protect match quality.

---

## 7. Non-Functional Requirements

- **Performance:** app TTI < 2.5s on broadband desktop; analysis ready < 3 min p50, < 6 min p95.
- **Reliability:** call connection success ≥ 95%; scoring jobs retried with backoff; idempotent.
- **Privacy & consent:** explicit recording consent; reps private by default; users can delete reps (and underlying recording/transcript) permanently.
- **Security:** signed URLs for recordings; row-level authorization (a recruiter can only fetch showcased reps).
- **Accessibility:** WCAG 2.1 AA for core flows; captions available.
- **Scalability:** media handled by managed SFU (scales independently of app servers); scoring is queue-based and horizontally scalable.
- **Cost control:** batch + cached LLM calls (see §9.5); transcription is batch (cheaper than streaming).
- **Compliance:** clear data-retention policy; GDPR-style delete/export.

---

## 8. Data Model (core entities)

```
User(id, role, name, email, headline, experience_level, industries[], avatar_url, created_at)
Organization(id, name)  // recruiters/managers belong to one
OrgMembership(user_id, org_id, role)  // recruiter | manager | admin
Scenario(id, track, difficulty, title, context, seller_objective,
         counterpart_persona, duration_s, rubric_weights_json, version, active)
MatchRequest(id, user_id, track, scenario_id|null, preferred_role, status, created_at)
Session(id, scenario_id, scenario_version, seller_id, counterpart_id,
        room_id, started_at, ended_at, status, recording_url, video_enabled)
Transcript(id, session_id, provider, diarized_json, duration_s, sentiment_json)
Score(id, session_id, subject_user_id, overall, dimensions_json,
      deterministic_json, strengths[], growth_areas[], moments_json, model, status)
SkillProfile(user_id, discovery, objection, dm_setting, closing, reps_count, updated_at)
Showcase(id, user_id, session_id, visibility)  // private | showcase | public
Shortlist(id, recruiter_id, name) / ShortlistItem(shortlist_id, candidate_id)
Notification(id, user_id, type, payload_json, read_at, created_at)
Report(id, reporter_id, session_id, reason, status)  // moderation
```

---

## 9. System Architecture & Recommended Tech Stack

The stack is deliberately **TypeScript end-to-end** so Claude Code can work across the whole codebase fluently, with managed services for the hard, undifferentiated parts (media, transcription, jobs). Every choice maps to a requirement below; alternatives are listed so you can swap with eyes open.

### 9.1 Recommended stack at a glance

| Layer | Recommendation | Why (for this app + Claude Code) | Alternatives |
|---|---|---|---|
| **Frontend** | **Next.js (App Router) + React + TypeScript** | One framework for UI + API routes; huge training corpus → Claude Code is very strong here; desktop-web fits perfectly | Remix, Vite + React |
| **UI / styling** | **Tailwind CSS + shadcn/ui** | Fast, consistent, accessible primitives; great for dashboards | Mantine, Chakra |
| **Client data/state** | **TanStack Query** (+ light Zustand) | Server-state caching, retries; minimal global state | SWR, Redux Toolkit |
| **API layer** | **tRPC** (or Next Route Handlers) | End-to-end type safety from DB → client; less glue code | REST + Zod, GraphQL |
| **Auth** | **Clerk** | Built-in **orgs + roles** (recruiters/managers/teams), social + LinkedIn login, fast to wire | Supabase Auth, Auth.js |
| **Database** | **PostgreSQL on Neon** (serverless) + **Prisma ORM** | Relational fits the entity model; Prisma schema is very Claude-Code-friendly | Supabase Postgres, PlanetScale |
| **Real-time video + recording** | **LiveKit Cloud** | The 2026 standard for production WebRTC; managed SFU, **Egress recording**, transcription hooks, scales independently of your app | Daily.co, Twilio Video, Agora |
| **Matchmaking / presence** | **Upstash Redis** (queue + presence) + LiveKit data channels for lobby | Serverless Redis for the queue; sorted sets for fair pairing | Supabase Realtime, Ably |
| **Background jobs** | **Inngest** | Durable, retried, event-driven jobs (transcription poll → score → notify); excellent DX with Next.js/Vercel | Trigger.dev, BullMQ + worker |
| **Transcription** | **AssemblyAI** (batch + diarization + audio intelligence) | Post-call is async, so **batch** is cheaper; strong speaker diarization + sentiment/entities — ideal for coaching analysis | Deepgram (better for live captions), Whisper |
| **AI scoring** | **Anthropic Claude API** | Structured-output scoring; tier by task (below). Native fit with your Claude Code workflow | — |
| **Object storage** | **Cloudflare R2** (or S3) | Cheap egress for recordings; signed URLs | AWS S3, Supabase Storage |
| **Dashboard charts** | **Tremor / Recharts** | Fast, clean analytics UI on React | visx, Chart.js |
| **Email** | **Resend** | Simple transactional email + React Email templates | Postmark, SendGrid |
| **Product analytics** | **PostHog** | Funnels, retention, session insight | Mixpanel |
| **Hosting** | **Vercel** (Next.js) + **Inngest Cloud** + **LiveKit Cloud** + **Neon** | Mostly serverless; only media/jobs are external managed services | Railway/Fly.io for a unified host |
| **Error/observability** | **Sentry** + LiveKit's call telemetry | Catch client + server errors; debug dropped calls | — |

### 9.2 Why LiveKit specifically
The live-call requirement (FR-14–FR-19) is the riskiest piece. LiveKit is now the de-facto production WebRTC backbone in 2026: it provides infrastructure software for real-time voice and video applications and powers OpenAI's ChatGPT voice mode, with customers including xAI, Salesforce, and Tesla. Its cloud handles the parts you don't want to build: LiveKit Cloud handles the realtime infrastructure, routing, and scaling, so you ship without managing media servers. Crucially, it cleanly separates concerns — LiveKit moves audio and video between participants with low latency but does not interpret speech or generate responses; the intelligence lives in separate services that connect to the streams. That separation is exactly your design: LiveKit transports + records the human-to-human call, and your scoring pipeline runs afterward.

> Even though many LiveKit guides focus on *AI-agent* voice calls, you're using it for the simpler, well-trodden case: **two humans on a call that gets recorded.** v2's "AI opponent" feature later slots into the same infrastructure via LiveKit Agents.

### 9.3 Why AssemblyAI for transcription
Your analysis is **post-call (asynchronous)**, so you don't need streaming-grade latency — you need accurate, speaker-separated transcripts with extra signal. In 2026, the practical split is clear: Deepgram leads on voice-agent latency and end-of-speech detection, while AssemblyAI leads on transcript intelligence (sentiment, topic, entity). AssemblyAI is also markedly cheaper once speaker ID is on: at base plus speaker identification, AssemblyAI costs about $0.17/hr versus Deepgram's $0.58/hr, roughly 3x less at every volume tier. If you later add **live captions during the call** (FR-19), add Deepgram for that streaming leg specifically, since Deepgram Flux is purpose-built for voice agents and posts the lowest end-of-speech detection latency.

### 9.4 Claude model tiering for scoring
Match the model to the task to control cost (current 2026 lineup and rates):
- **Classification/tagging** (e.g., labeling objection types) → **Haiku 4.5** — classification, extraction, and summarization go to Haiku 4.5.
- **Main rubric scoring** → **Sonnet 4.6**, the default production tier — at $3/$15 per million tokens it handles the vast majority of workloads including reasoning and structured analysis without the Opus premium.
- **Deep/disputed analysis** → **Opus 4.8 / 4.7** for the hardest reasoning, used sparingly.

Two big cost levers apply directly to your batch scoring jobs: batch processing is 50% cheaper across all models, and prompt caching cuts cached input cost by about 90%. Since every scoring call reuses the same long rubric system prompt, **cache the rubric** and **run scoring through the Batch API** — together that can cut scoring spend dramatically.

### 9.5 Scoring pipeline (concrete data flow)
```
Call ends (LiveKit)
  └─> LiveKit Egress writes recording to R2  ──┐
  └─> webhook "session.ended" → Inngest event │
Inngest function (durable, retried):           │
  1. submit recording to AssemblyAI (batch, diarized) <─┘
  2. poll/await transcript
  3. compute deterministic metrics (talk ratio, fillers, WPM)
  4. Claude API (Sonnet 4.6, cached rubric, Batch) → structured JSON score
  5. write Score + update SkillProfile
  6. emit notification (Resend email + in-app)
```

### 9.6 Architecture diagram (textual)
```
[ Next.js (Vercel) ] ──tRPC──> [ Postgres (Neon) via Prisma ]
        │  ▲                            ▲
   Clerk auth                           │ writes scores/profiles
        │  │                            │
        ▼  │                       [ Inngest jobs ]
[ LiveKit Cloud SFU ] ──Egress──> [ R2 storage ] ──> [ AssemblyAI ] ──> [ Claude API ]
        ▲                                                      
   WebRTC media                                                 
   (two practitioners)                                          
        │
[ Upstash Redis queue ] ── matchmaking/presence
```

---

## 10. Build Plan (phased for a Claude Code workflow)

Build vertically — get one full loop working before widening. Each phase is a Claude Code-sized chunk.

**Phase 0 — Foundations (week 1)**
Repo scaffold (Next.js + TS + Tailwind + shadcn), Prisma schema for core entities, Clerk auth with practitioner/recruiter roles, basic profile pages. *Exit: a user can sign up, pick a role, edit a profile.*

**Phase 1 — Live call MVP (weeks 2–3)**
LiveKit integration, device selection, 1:1 room, in-call timer/controls, recording via Egress to R2, consent flow. *Exit: two test users can complete a recorded call from a shared link (skip matchmaking — use manual room join).*

**Phase 2 — Scoring pipeline (weeks 3–4)**
Inngest job: AssemblyAI transcription → deterministic metrics → Claude scoring (cached rubric, structured output) → persist. Rep detail view with transcript + score. *Exit: a finished call produces a scored rep automatically.*

**Phase 3 — Matchmaking (week 5)**
Redis queue, role/scenario selection, pairing logic, lobby + brief reveal, no-show handling. *Exit: two users in queue get auto-matched into a roleplay.*

**Phase 4 — Practitioner dashboard & showcase (week 6)**
My Reps, skill profile + trends, showcase toggle, shareable public profile. *Exit: a practitioner can curate a portfolio.*

**Phase 5 — Recruiter/manager dashboard (week 7)**
Candidate search with skill filters, candidate cards, rep review (showcased only), shortlists/export, manager team view + drills. *Exit: a recruiter can filter candidates by skill and review reps.*

**Phase 6 — Polish & trust (week 8)**
Notifications (Resend + in-app), dispute flow, rubric calibration set in CI, Sentry + PostHog, accessibility pass, retention/delete controls. *Exit: launch-ready beta.*

---

## 11. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Matchmaking liquidity** (no one to match with) | Core loop breaks | Seed with scheduled rooms + "office hours"; recruit a starter cohort; consider solo-record mode early; AI opponent in v2 |
| **Scoring not trusted** | Users churn / recruiters ignore scores | Anchored rubric + visible evidence + calibration CI + dispute loop |
| **Recording consent / privacy** | Legal + trust | Explicit two-party consent, private-by-default, hard delete |
| **AI/transcription cost runaway** | Margin | Batch API + prompt caching + Haiku for cheap subtasks; cap rep length |
| **Call quality / drops** | Bad first impression | Use managed SFU (LiveKit), pre-call device test, telemetry alerts |
| **Gaming the score** | Devalues platform | Mix deterministic metrics; counterpart effort rating; anomaly flags |

---

## 12. Open Questions / Assumptions to Confirm

1. **Who pays?** Practitioners (freemium/subscription), recruiters (seat/search fees), or both? (Affects gating, not v1 architecture.)
2. **Video vs audio-only** for recordings — default? (Audio is enough for scoring; video adds presence signal but storage + privacy cost.)
3. **Score the counterpart too**, or seller-only in v1? (PRD assumes seller-only + lightweight effort rating.)
4. **Recruiter org verification** — how do you keep the recruiter side trustworthy (domain verification)?
5. **Geography/peak hours** for matchmaking liquidity — where's the initial cohort?
6. **Single-region vs multi-region** at launch (affects Neon/LiveKit region choices and latency).

---

### Appendix A — Stack rationale summary
Chosen for: (1) **end-to-end TypeScript** so Claude Code operates across the whole repo with maximum context; (2) **managed services for the hard parts** (WebRTC media, transcription, durable jobs) so you build product, not infrastructure; (3) **cost discipline** baked in (batch + cached LLM calls, batch transcription); (4) clear **v2 upgrade paths** (AI opponent via LiveKit Agents, live captions via Deepgram) without re-architecting.
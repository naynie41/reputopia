// Idempotent seed for non-prod environments. Creates an admin user, a sample
// organization, and an admin membership linking them. Safe to run repeatedly
// (all writes are upserts keyed by stable natural keys).
//
// Note: `../src/load-env` MUST be imported before `../src/index` so DATABASE_URL is
// loaded before the Prisma client is constructed.
import "../src/load-env";
import { getScenarioWeights, type Track } from "@sr/core";
import { Prisma, prisma } from "../src/index";

// Stable placeholder ids for seeded rows (real rows come from Clerk via webhook).
const ADMIN_CLERK_ID = "seed_admin";
const ADMIN_EMAIL = "admin@salesroleplay.dev";
const ORG_CLERK_ID = "seed_org_acme";

// Starter scenario library (PRD §5.2). 2 per track across difficulties, with real,
// usable seller objectives + counterpart persona briefs — these are what users roleplay.
// rubricWeights defaults to the track's @sr/core weighting preset (emphasizes the track's
// focal skill). Reseeding refreshes content (declarative); version stays 1.
type SeedScenario = {
  slug: string;
  track: Track;
  difficulty: number;
  title: string;
  context: string;
  sellerObjective: string;
  counterpartPersona: string;
  durationS: number;
};

const SCENARIOS: SeedScenario[] = [
  // ---- DM / cold setting ----
  {
    slug: "dm-cold-call-sales-ops",
    track: "DM_SETTING",
    difficulty: 1,
    title: "Cold call: sales-ops leader at a mid-market SaaS",
    context:
      "A pure cold outbound call — you've never spoken. You sell a sales-engagement platform. The goal is to earn a follow-up meeting, not to close anything today.",
    sellerObjective:
      "Open with a genuine pattern interrupt and earn the first 30 seconds. Tie a specific, quantified value hypothesis to their world (outbound efficiency / rep productivity), not a feature list. Secure one concrete next step: a 20-minute working session on a named day and time. If you can't earn it, exit gracefully — do not pitch into the void.",
    counterpartPersona:
      "You are Priya, Head of Sales Ops at a ~200-person SaaS company. You're busy and mildly annoyed at being cold-called. You'll grant about 20 seconds of attention. If the caller says something specific and relevant to your world, you warm up; if they launch into a generic pitch, you look for the exit. You'll agree to a next step only if they clearly earn it — otherwise a polite brush-off.",
    durationS: 360,
  },
  {
    slug: "dm-inbound-founder-followup",
    track: "DM_SETTING",
    difficulty: 2,
    title: "First live follow-up: founder who downloaded a guide",
    context:
      "The prospect downloaded a whitepaper last week — a soft inbound signal, no strong intent yet. This is the first live conversation. You sell a product-analytics tool.",
    sellerObjective:
      "Reference the trigger without over-weighting it. Reframe from 'content interest' to a real business problem worth solving, and lock a discovery call with a clear agenda and a specific time. Resist the urge to demo prematurely — the goal is a qualified next conversation.",
    counterpartPersona:
      "You are Marcus, a seed-stage founder — curious but time-poor and allergic to 'sales-y' follow-ups. You downloaded the guide for one specific reason: churn reporting is a growing headache. You'll engage if the seller connects to that real problem, and deflect vague value claims. Push back on 'just 30 minutes' unless there's a concrete reason it's worth your time.",
    durationS: 420,
  },

  // ---- Objection handling ----
  {
    slug: "obj-price-too-high",
    track: "OBJECTION",
    difficulty: 2,
    title: "Price objection from a cost-conscious VP",
    context:
      "A mid-cycle deal. The buyer likes the product but has pushed back hard on price versus their incumbent tool. This call is to handle the objection and keep the deal alive.",
    sellerObjective:
      "Acknowledge the concern without caving. Clarify the real driver (budget vs. value vs. timing) before responding. Reframe around outcomes and ROI with a specific proof point, then confirm the concern is actually resolved before moving on. Do not reach for a discount as your first move.",
    counterpartPersona:
      "You are Dana, VP of Marketing. You think the product is good but it's 'nearly twice the price' of your current tool. Your real concern isn't the number — it's defending the spend to your CFO. Lead with price pressure. If the seller uncovers the CFO angle and arms you with ROI and risk-of-inaction framing, you soften. If they discount instantly, you lose respect and press for more.",
    durationS: 540,
  },
  {
    slug: "obj-status-quo-stall",
    track: "OBJECTION",
    difficulty: 3,
    title: '"We\'re happy with what we have" — displacing the incumbent',
    context:
      "A late-stage stall. Your champion went quiet and now says the team is fine with the status quo. You must handle a status-quo / no-decision objection without being pushy.",
    sellerObjective:
      "Diagnose whether this is a real objection or a smokescreen. Surface the cost of inaction, isolate the true blocker, and earn a concrete next step (an exec conversation or a scoped pilot) — or a clean, honest 'not now' with a specific trigger to revisit. Stay non-defensive throughout.",
    counterpartPersona:
      "You are Sam, a director who championed the deal but got cold feet after an internal reorg. You're conflict-averse and hiding the real reason: a competing priority plus a fear of a failed rollout. Your default is 'we're fine for now.' You only open up if the seller earns trust and makes it safe to be honest; if pushed, you retreat behind vague reassurances.",
    durationS: 600,
  },

  // ---- Discovery ----
  {
    slug: "disc-first-call-revops",
    track: "DISCOVERY",
    difficulty: 1,
    title: "First discovery call: RevOps leader, broad problem",
    context:
      "A booked first meeting. You know the company but not the specifics. The goal is genuine discovery — not a demo.",
    sellerObjective:
      "Run structured discovery: set context, then ask layered open questions to uncover the real pain, quantify its impact, and qualify budget/authority/need/timeline naturally (not as a checklist). Close by summarizing what you heard and proposing a fitting next step. Aim to talk less than the prospect.",
    counterpartPersona:
      "You are Alex, a RevOps lead — cooperative, but you won't volunteer the important stuff unless asked well. Surface problem: 'reporting is a mess.' Underneath: data lives in three tools, leadership doesn't trust the numbers, and a board meeting in six weeks is forcing a decision. Reveal depth in proportion to question quality. Closed or leading questions get short, flat answers.",
    durationS: 720,
  },
  {
    slug: "disc-technical-skeptic",
    track: "DISCOVERY",
    difficulty: 3,
    title: "Discovery with a skeptical technical evaluator",
    context:
      "A second call, now with a technical evaluator in the room. You must discover both technical and business requirements and find a path to the economic buyer.",
    sellerObjective:
      "Uncover the technical requirements and the underlying business driver. Separate must-haves from nice-to-haves, quantify impact, and identify the economic buyer and decision process — without turning discovery into an interrogation. Earn a next step that widens the deal.",
    counterpartPersona:
      "You are Jordan, a senior engineer and skeptical evaluator who's watched tools overpromise. You test the seller with detailed technical questions and resist 'business-y' framing at first; you care most about integration effort and reliability. You know the economic buyer (your VP) but won't offer that unless the seller earns credibility and asks. Reward specificity; punish hand-waving.",
    durationS: 780,
  },

  // ---- Closing ----
  {
    slug: "close-trial-to-annual",
    track: "CLOSING",
    difficulty: 2,
    title: "Closing a trial that's going well but stalling",
    context:
      "A successful trial is ending. The user loves the product but hasn't committed. You need to convert them to a paid annual plan.",
    sellerObjective:
      "Reconfirm the value realized during the trial, then make a clear, confident ask for the annual commitment. Create legitimate urgency (trial end + an onboarding slot). Handle hesitation by isolating the real blocker and locking a concrete commitment — a signed order or a dated mutual close plan, not a soft 'let me think.'",
    counterpartPersona:
      "You are Robin, a team lead who genuinely likes the product. You're hesitant on an annual commitment because of budget timing and a vague worry about team adoption. Your instinct is 'let me think about it.' If the seller isolates the real blocker and offers a credible path (quarterly ramp, onboarding support), you'll move. If they get pushy or stay vague, you stall.",
    durationS: 540,
  },
  {
    slug: "close-procurement-gauntlet",
    track: "CLOSING",
    difficulty: 3,
    title: "Closing through a procurement + legal gauntlet",
    context:
      "You have a verbal yes from your champion, but the deal must clear procurement and legal by quarter-end. This call is to lock the path to signature.",
    sellerObjective:
      "Convert the verbal yes into a mutual close plan with named steps, owners, and dates. Tie urgency to a real business event, pre-empt procurement and legal friction, and secure a firm commitment (a signature timeline or exec sponsorship) rather than a soft 'we're working on it.'",
    counterpartPersona:
      "You are Taylor, the champion. You want the deal, but you're not the final signer and you're wary of over-promising on procurement, which is slow at your company. You'll commit to what you control and hedge on the rest. If the seller builds a specific plan and hands you tools to push internally, you engage; if they pressure you for dates you can't own, you get defensive.",
    durationS: 600,
  },
];

async function main() {
  const admin = await prisma.user.upsert({
    where: { clerkId: ADMIN_CLERK_ID },
    update: {}, // leave existing data untouched on re-run
    create: {
      clerkId: ADMIN_CLERK_ID,
      email: ADMIN_EMAIL,
      role: "ADMIN",
      name: "Seed Admin",
      onboardedAt: new Date(),
    },
  });

  const org = await prisma.organization.upsert({
    where: { clerkId: ORG_CLERK_ID },
    update: {},
    create: {
      clerkId: ORG_CLERK_ID,
      name: "Acme Talent",
      slug: "acme-talent",
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_organizationId: { userId: admin.id, organizationId: org.id } },
    update: { role: "ADMIN" },
    create: { userId: admin.id, organizationId: org.id, role: "ADMIN" },
  });

  for (const s of SCENARIOS) {
    const rubricWeights = { ...getScenarioWeights(s.track) } as Prisma.InputJsonValue;
    const data = {
      track: s.track,
      difficulty: s.difficulty,
      title: s.title,
      context: s.context,
      sellerObjective: s.sellerObjective,
      counterpartPersona: s.counterpartPersona,
      durationS: s.durationS,
      rubricWeights,
      active: true,
    };
    await prisma.scenario.upsert({
      where: { slug: s.slug },
      update: data, // declarative: reseeding refreshes library content
      create: { slug: s.slug, ...data },
    });
  }

  console.log(
    `✅ Seeded admin (${admin.email}), organization (${org.name}), and ${SCENARIOS.length} scenarios.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

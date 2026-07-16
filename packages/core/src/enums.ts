import { z } from "zod";

/**
 * Canonical domain enums. These MUST stay in sync with the Prisma enums in
 * packages/db/prisma/schema.prisma (same member names). Defined here once so the
 * tRPC layer, forms, and UI all share a single zod source of truth.
 */

/** Top-level account role chosen at onboarding. */
export const USER_ROLES = ["PRACTITIONER", "RECRUITER", "MANAGER", "ADMIN"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Role within a recruiter/manager organization (Clerk org membership). */
export const ORG_ROLES = ["RECRUITER", "MANAGER", "ADMIN"] as const;
export const orgRoleSchema = z.enum(ORG_ROLES);
export type OrgRole = z.infer<typeof orgRoleSchema>;

/** The four skill tracks (PRD §4). Used in later phases; defined now for the schema. */
export const TRACKS = ["DM_SETTING", "OBJECTION", "DISCOVERY", "CLOSING"] as const;
export const trackSchema = z.enum(TRACKS);
export type Track = z.infer<typeof trackSchema>;

/** Self-reported experience level on a practitioner profile. */
export const EXPERIENCE_LEVELS = ["STUDENT", "JUNIOR", "MID", "SENIOR", "LEAD"] as const;
export const experienceLevelSchema = z.enum(EXPERIENCE_LEVELS);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

/** The onboarding choice: a single account "track" the user self-selects first. */
export const ONBOARDING_CHOICES = ["PRACTITIONER", "RECRUITER_MANAGER"] as const;
export const onboardingChoiceSchema = z.enum(ONBOARDING_CHOICES);
export type OnboardingChoice = z.infer<typeof onboardingChoiceSchema>;

/** Phase 2: lifecycle of a session's AssemblyAI transcription job. */
export const TRANSCRIPT_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const;
export const transcriptStatusSchema = z.enum(TRANSCRIPT_STATUSES);
export type TranscriptStatus = z.infer<typeof transcriptStatusSchema>;

/** Phase 2: lifecycle of a session's AI scoring job (drives the FR-23 UI state). */
export const SCORE_STATUSES = ["PENDING", "PROCESSING", "COMPLETE", "FAILED"] as const;
export const scoreStatusSchema = z.enum(SCORE_STATUSES);
export type ScoreStatus = z.infer<typeof scoreStatusSchema>;

/** Phase 3: which side a user wants to play in matchmaking (PRD FR-9). */
export const PREFERRED_ROLES = ["SELLER", "COUNTERPART", "EITHER"] as const;
export const preferredRoleSchema = z.enum(PREFERRED_ROLES);
export type PreferredRole = z.infer<typeof preferredRoleSchema>;

/** Phase 3: lifecycle of a matchmaking queue request. */
export const MATCH_STATUSES = ["WAITING", "MATCHED", "CANCELED", "EXPIRED"] as const;
export const matchStatusSchema = z.enum(MATCH_STATUSES);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

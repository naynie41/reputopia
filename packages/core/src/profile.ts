import { z } from "zod";
import { experienceLevelSchema, onboardingChoiceSchema, trackSchema } from "./enums";

/**
 * Domain validation schemas for onboarding + profile editing (PRD FR-2, FR-3, FR-4).
 * Shared by the client form (react-hook-form resolver) and the server tRPC router,
 * so input is validated identically on both sides.
 */

/** First-login role selection. Recruiter/manager flow also needs an org name. */
export const onboardingInputSchema = z
  .object({
    choice: onboardingChoiceSchema,
    // Optional + no min here so the empty default is valid for the practitioner path;
    // the length requirement is enforced conditionally below for recruiters/managers.
    organizationName: z.string().trim().max(80).optional(),
  })
  .refine((v) => v.choice !== "RECRUITER_MANAGER" || (v.organizationName?.length ?? 0) >= 2, {
    message: "Enter an organization name (at least 2 characters).",
    path: ["organizationName"],
  });
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

const industriesSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(10, "At most 10 industries.")
  .default([]);

/** Practitioner profile fields (FR-3): name, headline, target role, experience, industries, avatar. */
export const practitionerProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  headline: z.string().trim().max(120).optional().or(z.literal("")),
  targetRole: z.string().trim().max(60).optional().or(z.literal("")),
  experienceLevel: experienceLevelSchema.optional(),
  industries: industriesSchema,
  primaryTrack: trackSchema.optional(),
  avatarUrl: z.string().url("Enter a valid image URL.").optional().or(z.literal("")),
});
export type PractitionerProfileInput = z.infer<typeof practitionerProfileSchema>;

/** Recruiter/manager profile fields (FR-4). */
export const recruiterProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  headline: z.string().trim().max(120).optional().or(z.literal("")),
});
export type RecruiterProfileInput = z.infer<typeof recruiterProfileSchema>;

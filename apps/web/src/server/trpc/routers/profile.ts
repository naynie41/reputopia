import { TRPCError } from "@trpc/server";
import { clerkClient } from "@clerk/nextjs/server";
import {
  onboardingInputSchema,
  practitionerProfileSchema,
  recruiterProfileSchema,
} from "@sr/core";
import { createTRPCRouter, protectedProcedure } from "../init";
import { ensureDbUser, getDbUser } from "../../users";

/** Normalize an optional string field: trim, and treat "" as null. */
function nullableText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const profileRouter = createTRPCRouter({
  /** Read-only fetch of the caller's profile, or null if not yet created (gating). */
  current: protectedProcedure.query(async ({ ctx }) => {
    return getDbUser(ctx.clerkAuth.userId);
  }),

  /** Current user's profile (self-healing: creates the DB row if missing). */
  me: protectedProcedure.query(async ({ ctx }) => {
    return ensureDbUser(ctx.clerkAuth.userId);
  }),

  /** First-login role selection (FR-2). */
  completeOnboarding: protectedProcedure
    .input(onboardingInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ensureDbUser(ctx.clerkAuth.userId);

      if (input.choice === "PRACTITIONER") {
        await ctx.prisma.user.update({
          where: { id: user.id },
          data: {
            role: "PRACTITIONER",
            onboardedAt: new Date(),
            skillProfile: { connectOrCreate: { where: { userId: user.id }, create: {} } },
          },
        });
        return getDbUser(ctx.clerkAuth.userId);
      }

      // Recruiter / manager: create a real Clerk organization (synced to Postgres by
      // the Clerk webhook). The org name is required by the input schema here.
      try {
        const client = await clerkClient();
        await client.organizations.createOrganization({
          name: input.organizationName!,
          createdBy: ctx.clerkAuth.userId,
        });
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create the organization. Is the Clerk Organizations feature enabled?",
          cause: err,
        });
      }

      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { role: "RECRUITER", onboardedAt: new Date() },
      });
      return getDbUser(ctx.clerkAuth.userId);
    }),

  /**
   * Edit practitioner profile (FR-3).
   *
   * Authorization: the row updated is resolved from the authenticated caller
   * (`ctx.clerkAuth.userId`) — there is no user-id input — so a user can only ever
   * edit their OWN profile.
   */
  updatePractitionerProfile: protectedProcedure
    .input(practitionerProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ensureDbUser(ctx.clerkAuth.userId);
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: {
          name: input.name.trim(),
          headline: nullableText(input.headline),
          targetRole: nullableText(input.targetRole),
          experienceLevel: input.experienceLevel ?? null,
          industries: input.industries,
          primaryTrack: input.primaryTrack ?? null,
          avatarUrl: nullableText(input.avatarUrl),
        },
      });
      return getDbUser(ctx.clerkAuth.userId);
    }),

  /**
   * Edit recruiter/manager profile (FR-4).
   *
   * Authorization: updates only the authenticated caller's own row (no user-id input).
   */
  updateRecruiterProfile: protectedProcedure
    .input(recruiterProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ensureDbUser(ctx.clerkAuth.userId);
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { name: input.name.trim(), headline: nullableText(input.headline) },
      });
      return getDbUser(ctx.clerkAuth.userId);
    }),
});

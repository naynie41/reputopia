import { CONSENT_TEXT, CONSENT_VERSION, acceptConsentInputSchema } from "@sr/core";
import { createTRPCRouter, protectedProcedure } from "../init";
import { ensureDbUser } from "../../users";

/** Recording consent (FR-18). Versioned + auditable in the RecordingConsent table. */
export const consentRouter = createTRPCRouter({
  /** Current consent text/version + whether the caller has accepted the current one. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    const accepted = await ctx.prisma.recordingConsent.findUnique({
      where: { userId_version: { userId: user.id, version: CONSENT_VERSION } },
    });
    return { version: CONSENT_VERSION, text: CONSENT_TEXT, accepted: Boolean(accepted) };
  }),

  /** Record acceptance of a consent version (idempotent per user+version). */
  accept: protectedProcedure.input(acceptConsentInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    await ctx.prisma.recordingConsent.upsert({
      where: { userId_version: { userId: user.id, version: input.version } },
      create: { userId: user.id, version: input.version },
      update: {},
    });
    return { ok: true };
  }),
});

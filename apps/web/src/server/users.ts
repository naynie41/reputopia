import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@sr/db";

// Shared include so every user read returns the same shape (skill profile + the
// user's org memberships with their organization, for the recruiter profile view).
const userInclude = {
  skillProfile: true,
  memberships: { include: { organization: true } },
} as const;

/** Read the DB user for a Clerk id without creating it (page/route gating + reads). */
export async function getDbUser(clerkUserId: string) {
  return prisma.user.findUnique({
    where: { clerkId: clerkUserId },
    include: userInclude,
  });
}

/**
 * Returns the Postgres User row for a Clerk user, creating it if missing.
 *
 * In production the Clerk webhook (`/api/webhooks/clerk`) is the source of truth and
 * normally creates this row on `user.created`. This helper self-heals in local dev
 * (where the webhook may not be tunneled) so the profile flow works without it.
 */
export async function ensureDbUser(clerkUserId: string) {
  const existing = await getDbUser(clerkUserId);
  if (existing) return existing;

  const cu = await currentUser();
  const email =
    cu?.primaryEmailAddress?.emailAddress ?? cu?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!email) {
    throw new Error("Cannot create user: no email address on the Clerk account.");
  }

  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null;

  await prisma.user.create({
    data: {
      clerkId: clerkUserId,
      email,
      name,
      avatarUrl: cu?.imageUrl ?? null,
    },
  });

  // Re-read with the shared include so the return shape always matches getDbUser.
  return (await getDbUser(clerkUserId))!;
}

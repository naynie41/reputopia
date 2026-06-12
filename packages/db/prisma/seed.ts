// Idempotent seed for non-prod environments. Creates an admin user, a sample
// organization, and an admin membership linking them. Safe to run repeatedly
// (all writes are upserts keyed by stable natural keys).
//
// Note: `../src/load-env` MUST be imported before `../src/index` so DATABASE_URL is
// loaded before the Prisma client is constructed.
import "../src/load-env";
import { prisma } from "../src/index";

// Stable placeholder ids for seeded rows (real rows come from Clerk via webhook).
const ADMIN_CLERK_ID = "seed_admin";
const ADMIN_EMAIL = "admin@salesroleplay.dev";
const ORG_CLERK_ID = "seed_org_acme";

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

  console.log(`✅ Seeded admin (${admin.email}) and organization (${org.name}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { prisma } from "@sr/db";
import type { OrgRole } from "@sr/core";

/**
 * Clerk -> Postgres sync. Per the architecture rules, this webhook does MINIMAL
 * work: verify signature -> persist. No slow/heavy work here. Verification uses the
 * Svix signature via CLERK_WEBHOOK_SIGNING_SECRET (read by verifyWebhook).
 *
 * Idempotent: all writes are upserts/deletes keyed by Clerk ids, so redelivered
 * events are safe.
 */
function mapOrgRole(clerkRole: string | undefined): OrgRole {
  if (!clerkRole) return "RECRUITER";
  const normalized = clerkRole.replace(/^org:/, "").toLowerCase();
  if (normalized === "admin") return "ADMIN";
  if (normalized === "manager") return "MANAGER";
  return "RECRUITER";
}

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const { id, email_addresses, primary_email_address_id, first_name, last_name, image_url } =
        evt.data;
      const primary =
        email_addresses.find((e) => e.id === primary_email_address_id) ?? email_addresses[0];
      const email = primary?.email_address;
      if (!email) break;
      const name = [first_name, last_name].filter(Boolean).join(" ") || null;

      await prisma.user.upsert({
        where: { clerkId: id },
        create: { clerkId: id, email, name, avatarUrl: image_url ?? null },
        update: { email, name, avatarUrl: image_url ?? null },
      });
      break;
    }

    case "user.deleted": {
      // Hard delete (CLAUDE.md: deleting an account removes its data; cascades apply).
      if (evt.data.id) {
        await prisma.user.deleteMany({ where: { clerkId: evt.data.id } });
      }
      break;
    }

    case "organization.created":
    case "organization.updated": {
      const { id, name, slug } = evt.data;
      await prisma.organization.upsert({
        where: { clerkId: id },
        create: { clerkId: id, name, slug: slug ?? null },
        update: { name, slug: slug ?? null },
      });
      break;
    }

    case "organization.deleted": {
      if (evt.data.id) {
        await prisma.organization.deleteMany({ where: { clerkId: evt.data.id } });
      }
      break;
    }

    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const orgClerkId = evt.data.organization.id;
      const userClerkId = evt.data.public_user_data?.user_id;
      if (!userClerkId) break;

      const [org, user] = await Promise.all([
        prisma.organization.findUnique({ where: { clerkId: orgClerkId } }),
        prisma.user.findUnique({ where: { clerkId: userClerkId } }),
      ]);
      if (!org || !user) break; // org/user event will arrive separately; redelivery reconciles.

      const role = mapOrgRole(evt.data.role);
      await prisma.orgMembership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
        create: { userId: user.id, organizationId: org.id, role },
        update: { role },
      });
      break;
    }

    case "organizationMembership.deleted": {
      const orgClerkId = evt.data.organization.id;
      const userClerkId = evt.data.public_user_data?.user_id;
      if (!userClerkId) break;
      const [org, user] = await Promise.all([
        prisma.organization.findUnique({ where: { clerkId: orgClerkId } }),
        prisma.user.findUnique({ where: { clerkId: userClerkId } }),
      ]);
      if (org && user) {
        await prisma.orgMembership.deleteMany({
          where: { userId: user.id, organizationId: org.id },
        });
      }
      break;
    }

    default:
      // Ignore other event types.
      break;
  }

  return NextResponse.json({ received: true });
}

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@sr/db";

/**
 * Match lobby (PRD FR-11): between pairing and the call. Each participant sees their own
 * ROLE and their own BRIEF only — the seller sees the scenario's seller objective, the
 * counterpart sees the persona. The other side's brief is NEVER fetched into the response,
 * so it can't leak. Ready state (a boolean) is shared so each can see the other readying up.
 */

export type LobbyRole = "seller" | "counterpart";

/** Resolve the caller's role on a session, or throw if they aren't a participant. */
function participantRole(
  session: { sellerId: string; counterpartId: string | null },
  userId: string,
): LobbyRole {
  if (session.sellerId === userId) return "seller";
  if (session.counterpartId === userId) return "counterpart";
  throw new TRPCError({ code: "FORBIDDEN", message: "You are not a participant in this match." });
}

export async function getLobbyView(prisma: PrismaClient, sessionId: string, userId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      seller: { select: { id: true, name: true, avatarUrl: true } },
      counterpart: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Match not found." });

  const role = participantRole(session, userId);
  const you = role === "seller" ? session.seller : session.counterpart;
  const partner = role === "seller" ? session.counterpart : session.seller;
  const youReady = role === "seller" ? session.sellerReady : session.counterpartReady;
  const partnerReady = role === "seller" ? session.counterpartReady : session.sellerReady;

  // Scenario: expose the SHARED context to both, but only THIS role's brief.
  const scenario = session.scenarioId
    ? await prisma.scenario.findUnique({ where: { id: session.scenarioId } })
    : null;
  const brief = scenario
    ? role === "seller"
      ? scenario.sellerObjective
      : scenario.counterpartPersona
    : null;

  return {
    sessionId: session.id,
    status: session.status,
    role,
    brief, // caller's own brief only
    scenario: scenario
      ? {
          title: scenario.title,
          context: scenario.context,
          track: scenario.track,
          difficulty: scenario.difficulty,
        }
      : null,
    durationMinutes: session.durationMinutes,
    createdAt: session.createdAt, // synced countdown anchor for both participants
    you: { name: you?.name ?? null, ready: youReady },
    partner: { name: partner?.name ?? null, avatarUrl: partner?.avatarUrl ?? null, ready: partnerReady },
    bothReady: session.sellerReady && session.counterpartReady,
  };
}

/** Mark the caller ready. Returns whether both are now ready. */
export async function setReady(
  prisma: PrismaClient,
  sessionId: string,
  userId: string,
): Promise<{ bothReady: boolean }> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, sellerId: true, counterpartId: true, status: true },
  });
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Match not found." });
  if (session.status === "ENDED" || session.status === "CANCELED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This match is no longer active." });
  }
  const role = participantRole(session, userId);

  const updated = await prisma.session.update({
    where: { id: session.id },
    data: role === "seller" ? { sellerReady: true } : { counterpartReady: true },
    select: { sellerReady: true, counterpartReady: true },
  });
  return { bothReady: updated.sellerReady && updated.counterpartReady };
}

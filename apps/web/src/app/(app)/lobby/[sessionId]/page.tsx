import { Lobby } from "@/components/lobby/lobby";

// Match lobby (PRD FR-11). Auth + onboarding gating handled by the (app) layout;
// per-session authorization (participants only, own-brief-only) is enforced in the
// lobby.get tRPC query. Client component because it polls ready state.
export default async function LobbyPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <Lobby sessionId={sessionId} />;
}

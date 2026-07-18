import { FindMatch } from "@/components/matchmaking/find-match";

export default function RoleplaysPage() {
  // Auth + onboarding gating handled by the (app) layout. Matchmaking is the primary
  // entry point: pick a track/scenario/role, join the queue, and get paired into a call.
  return <FindMatch />;
}

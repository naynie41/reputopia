import { RepDetail } from "@/components/rep/rep-detail";

// Rep detail view (PRD FR-26). Auth + onboarding gating handled by the (app) layout;
// per-rep authorization (own reps only) is enforced in the score.getBySession query.
// Client component because it polls for the score while the pipeline runs.
export default async function RepPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <RepDetail sessionId={sessionId} />;
}

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CallClient } from "@/components/call/call-client";

// Full-screen call route (deliberately outside the (app) sidebar shell).
// The call UI is loaded client-only (see CallClient) because livekit-client
// cannot be server-rendered.
export default async function CallPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { sessionId } = await params;
  return <CallClient sessionId={sessionId} />;
}

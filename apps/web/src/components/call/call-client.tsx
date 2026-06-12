"use client";

import dynamic from "next/dynamic";

// livekit-client touches browser-only globals at import, so the whole call
// experience must load client-side only (no SSR) to avoid crashing the render worker.
const CallExperience = dynamic(
  () => import("./call-experience").then((m) => ({ default: m.CallExperience })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading call…
      </div>
    ),
  },
);

export function CallClient({ sessionId }: { sessionId: string }) {
  return <CallExperience sessionId={sessionId} />;
}

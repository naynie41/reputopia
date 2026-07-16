"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LOBBY_COUNTDOWN_SECONDS } from "@sr/core";
import { useTRPC } from "@/trpc/client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TRACK_LABEL: Record<string, string> = {
  DM_SETTING: "DM / Cold setting",
  OBJECTION: "Objection handling",
  DISCOVERY: "Discovery",
  CLOSING: "Closing",
};

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Lobby({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC();
  const router = useRouter();

  const lobbyQuery = useQuery(
    trpc.lobby.get.queryOptions(
      { sessionId },
      {
        // Poll so each side sees the other ready up; stop once both are ready.
        refetchInterval: (query) => (query.state.data?.bothReady ? false : 1500),
      },
    ),
  );

  const ready = useMutation(
    trpc.lobby.ready.mutationOptions({ onSuccess: () => lobbyQuery.refetch() }),
  );

  const data = lobbyQuery.data;

  // Once both are ready, move both participants into the call room.
  useEffect(() => {
    if (data?.bothReady) router.push(`/call/${sessionId}`);
  }, [data?.bothReady, router, sessionId]);

  // Synced countdown from the session's creation time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = useMemo(() => {
    if (!data) return LOBBY_COUNTDOWN_SECONDS;
    const deadline = new Date(data.createdAt).getTime() + LOBBY_COUNTDOWN_SECONDS * 1000;
    return Math.max(0, (deadline - now) / 1000);
  }, [data, now]);

  if (lobbyQuery.isLoading) return <Centered>Loading the lobby…</Centered>;
  if (lobbyQuery.isError) {
    return (
      <Centered>
        {lobbyQuery.error.data?.code === "FORBIDDEN"
          ? "You are not a participant in this match."
          : "This match isn't available."}
      </Centered>
    );
  }
  if (!data) return <Centered>Match not found.</Centered>;

  if (data.status === "CANCELED" || data.status === "ENDED") {
    return <Centered>This match is no longer active.</Centered>;
  }

  const roleLabel = data.role === "seller" ? "You are the Seller" : "You are the Counterpart";
  const briefLabel = data.role === "seller" ? "Your objective" : "Your persona";

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Match lobby</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.scenario ? TRACK_LABEL[data.scenario.track] ?? data.scenario.track : "Roleplay"} ·{" "}
            {data.durationMinutes} min
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">{clock(remaining)}</div>
          <div className="text-xs text-muted-foreground">until start</div>
        </div>
      </header>

      <div className="mt-6 flex items-center gap-2">
        <Badge variant="brand">{roleLabel}</Badge>
        {data.scenario && <Badge variant="secondary">Difficulty {data.scenario.difficulty}</Badge>}
      </div>

      {data.scenario && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{data.scenario.title}</CardTitle>
            <CardDescription>{data.scenario.context}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* The caller's OWN brief only — the other side's is never sent here. */}
      <Card className="mt-4 border-indigo-200 dark:border-indigo-900/60">
        <CardHeader>
          <CardTitle className="text-base">{briefLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{data.brief ?? "No brief available."}</p>
        </CardContent>
      </Card>

      {/* Partner + ready gating. */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Avatar src={data.partner.avatarUrl} name={data.partner.name ?? "Partner"} className="size-10" />
          <div>
            <div className="text-sm font-medium">{data.partner.name ?? "Your counterpart"}</div>
            <div className="text-xs text-muted-foreground">
              {data.partner.ready ? (
                <span className="text-green-600 dark:text-green-400">Ready ✓</span>
              ) : (
                "Not ready yet…"
              )}
            </div>
          </div>
        </div>

        <Button
          size="lg"
          disabled={data.you.ready || ready.isPending}
          onClick={() => ready.mutate({ sessionId })}
        >
          {data.you.ready ? "You're ready ✓" : ready.isPending ? "…" : "I'm ready"}
        </Button>
      </div>

      {data.you.ready && !data.partner.ready && (
        <p className="mt-4 text-sm text-muted-foreground">
          Waiting for your counterpart to ready up — the call starts automatically when you both are.
        </p>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-8 py-20 text-center text-muted-foreground">{children}</div>
  );
}

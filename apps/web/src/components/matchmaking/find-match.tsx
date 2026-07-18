"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  QUEUE_HEARTBEAT_INTERVAL_SECONDS,
  TRACKS,
  type PreferredRole,
  type Track,
} from "@sr/core";
import { useTRPC } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TRACK_META: Record<Track, { label: string; blurb: string }> = {
  DM_SETTING: { label: "DM / Cold setting", blurb: "Pattern interrupt, value framing, secure the next step." },
  OBJECTION: { label: "Objection handling", blurb: "Acknowledge, clarify, respond, confirm — stay composed." },
  DISCOVERY: { label: "Discovery", blurb: "Open questions, uncover pain, qualify the deal." },
  CLOSING: { label: "Closing", blurb: "Clear ask, urgency, handle hesitation, lock commitment." },
};

const ROLES: { value: PreferredRole; label: string; desc: string }[] = [
  { value: "SELLER", label: "Seller", desc: "You run the call." },
  { value: "COUNTERPART", label: "Counterpart", desc: "You play the prospect." },
  { value: "EITHER", label: "Either", desc: "Match me faster." },
];

const DIFFICULTIES = [1, 2, 3] as const;

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function FindMatch() {
  const trpc = useTRPC();
  const router = useRouter();

  const [track, setTrack] = useState<Track | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [role, setRole] = useState<PreferredRole>("EITHER");
  const [searching, setSearching] = useState(false);
  const [secondsInQueue, setSecondsInQueue] = useState(0);

  const scenarios = useQuery(
    trpc.scenario.list.queryOptions(
      { track: track ?? undefined, difficulty: difficulty ?? undefined },
      { enabled: track !== null },
    ),
  );

  const joinQueue = useMutation(
    trpc.matchmaking.joinQueue.mutationOptions({
      onSuccess: (res) => {
        if (res.status === "MATCHED") router.push(`/lobby/${res.sessionId}`);
        else {
          setSecondsInQueue(0);
          setSearching(true);
        }
      },
    }),
  );
  const leaveQueue = useMutation(
    trpc.matchmaking.leaveQueue.mutationOptions({ onSuccess: () => setSearching(false) }),
  );
  const heartbeat = useMutation(trpc.matchmaking.heartbeat.mutationOptions());

  const status = useQuery(
    trpc.matchmaking.getQueueStatus.queryOptions(undefined, {
      enabled: searching,
      refetchInterval: searching ? 2000 : false,
    }),
  );

  // Route to the lobby the moment we're matched.
  const matchedSessionId =
    searching && status.data?.status === "MATCHED" ? status.data.sessionId : null;
  useEffect(() => {
    if (matchedSessionId) router.push(`/lobby/${matchedSessionId}`);
  }, [matchedSessionId, router]);

  // Keep the queue entry alive while searching (so it doesn't expire as a stale tab).
  const heartbeatMutate = heartbeat.mutate;
  useEffect(() => {
    if (!searching) return;
    const t = setInterval(() => heartbeatMutate(), QUEUE_HEARTBEAT_INTERVAL_SECONDS * 1000);
    return () => clearInterval(t);
  }, [searching, heartbeatMutate]);

  // Time-in-queue ticker (a plain counter — no impure clock reads during render).
  useEffect(() => {
    if (!searching) return;
    const t = setInterval(() => setSecondsInQueue((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [searching]);

  function pickTrack(t: Track) {
    setTrack(t);
    setScenarioId(null); // scenario belongs to a track
  }
  function pickDifficulty(d: number | null) {
    setDifficulty(d);
    setScenarioId(null);
  }

  if (searching) {
    return (
      <SearchingView
        elapsed={secondsInQueue}
        trackLabel={track ? TRACK_META[track].label : ""}
        role={ROLES.find((r) => r.value === role)!.label}
        scenarioTitle={scenarios.data?.find((s) => s.id === scenarioId)?.title ?? "Any scenario"}
        canceling={leaveQueue.isPending}
        onCancel={() => leaveQueue.mutate()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Find a match</h1>
        <p className="mt-2 text-muted-foreground">
          Get paired with another practitioner for a live, AI-scored roleplay.
        </p>
      </header>

      {/* Track */}
      <Section step={1} title="Pick a track">
        <div className="grid gap-3 sm:grid-cols-2">
          {TRACKS.map((t) => (
            <SelectableCard key={t} selected={track === t} onClick={() => pickTrack(t)}>
              <div className="font-medium">{TRACK_META[t].label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{TRACK_META[t].blurb}</div>
            </SelectableCard>
          ))}
        </div>
      </Section>

      {/* Difficulty */}
      <Section step={2} title="Difficulty" hint="optional">
        <div className="flex flex-wrap gap-2">
          <Pill selected={difficulty === null} onClick={() => pickDifficulty(null)}>
            Any
          </Pill>
          {DIFFICULTIES.map((d) => (
            <Pill key={d} selected={difficulty === d} onClick={() => pickDifficulty(d)}>
              Level {d}
            </Pill>
          ))}
        </div>
      </Section>

      {/* Scenario */}
      <Section step={3} title="Scenario" hint="optional">
        {track === null ? (
          <p className="text-sm text-muted-foreground">Pick a track first.</p>
        ) : (
          <div className="space-y-2">
            <SelectableRow selected={scenarioId === null} onClick={() => setScenarioId(null)}>
              <span className="font-medium">Any scenario in this track</span>
              <span className="text-sm text-muted-foreground">Fastest — we pick one.</span>
            </SelectableRow>
            {scenarios.isLoading && <p className="text-sm text-muted-foreground">Loading scenarios…</p>}
            {scenarios.data?.map((s) => (
              <SelectableRow key={s.id} selected={scenarioId === s.id} onClick={() => setScenarioId(s.id)}>
                <span className="font-medium">{s.title}</span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">Level {s.difficulty}</Badge>
                  {Math.round(s.durationS / 60)} min
                </span>
              </SelectableRow>
            ))}
          </div>
        )}
      </Section>

      {/* Role */}
      <Section step={4} title="Your role">
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((r) => (
            <SelectableCard key={r.value} selected={role === r.value} onClick={() => setRole(r.value)}>
              <div className="font-medium">{r.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{r.desc}</div>
            </SelectableCard>
          ))}
        </div>
      </Section>

      {joinQueue.isError && (
        <p className="mt-6 text-sm text-destructive">{joinQueue.error.message}</p>
      )}

      <div className="mt-8 flex items-center gap-4">
        <Button
          size="lg"
          disabled={track === null || joinQueue.isPending}
          onClick={() =>
            track &&
            joinQueue.mutate({ track, scenarioId: scenarioId ?? undefined, preferredRole: role })
          }
        >
          {joinQueue.isPending ? "Joining…" : "Find a match"}
        </Button>
        {track === null && (
          <span className="text-sm text-muted-foreground">Choose a track to start.</span>
        )}
      </div>
    </div>
  );
}

function SearchingView({
  elapsed,
  trackLabel,
  role,
  scenarioTitle,
  canceling,
  onCancel,
}: {
  elapsed: number;
  trackLabel: string;
  role: string;
  scenarioTitle: string;
  canceling: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-8 py-24 text-center">
      <span className="relative flex size-4">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-75" />
        <span className="relative inline-flex size-4 rounded-full bg-indigo-500" />
      </span>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Searching for a match…</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pairing you with another practitioner. This is usually quick.
      </p>
      <div className="mt-6 text-4xl font-semibold tabular-nums">{clock(elapsed)}</div>
      <div className="mt-1 text-xs text-muted-foreground">in queue</div>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Badge variant="brand">{trackLabel}</Badge>
        <Badge variant="secondary">{role}</Badge>
        <Badge variant="outline">{scenarioTitle}</Badge>
      </div>

      <Button className="mt-8" variant="outline" disabled={canceling} onClick={onCancel}>
        {canceling ? "Canceling…" : "Cancel"}
      </Button>
    </div>
  );
}

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs">
          {step}
        </span>
        {title}
        {hint && <span className="text-xs font-normal text-muted-foreground">({hint})</span>}
      </h2>
      {children}
    </section>
  );
}

function SelectableCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}

function SelectableRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}

function Pill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" size="sm" variant={selected ? "default" : "outline"} onClick={onClick}>
      {children}
    </Button>
  );
}

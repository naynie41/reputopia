"use client";

import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getDimension, type Moment, type ScoredDimension } from "@sr/core";
import type { AppRouter } from "@/server/trpc/root";
import { useTRPC } from "@/trpc/client";

type RepOutput = inferRouterOutputs<AppRouter>["score"]["getBySession"];
type RepScore = NonNullable<RepOutput["score"]>;
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** mm:ss from seconds. */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Parse an evidence ref like "turn_12" → 12 (or null if it isn't a turn ref). */
function turnIndex(ref: string): number | null {
  const m = /turn[_-]?(\d+)/i.exec(ref);
  return m ? Number(m[1]) : null;
}

function scrollToTurn(i: number) {
  document.getElementById(`turn-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function scoreTone(score: number): "success" | "brand" | "secondary" {
  if (score >= 80) return "success";
  if (score >= 60) return "brand";
  return "secondary";
}

export function RepDetail({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC();
  const repQuery = useQuery(
    trpc.score.getBySession.queryOptions(
      { sessionId },
      {
        // Poll while the pipeline runs; stop once the score is terminal.
        refetchInterval: (query) => {
          const status = query.state.data?.status;
          return status === "COMPLETE" || status === "FAILED" ? false : 5000;
        },
      },
    ),
  );

  if (repQuery.isLoading) {
    return <Centered>Loading your rep…</Centered>;
  }
  if (repQuery.isError) {
    return (
      <Centered>
        {repQuery.error.data?.code === "FORBIDDEN"
          ? "This rep isn't available to you."
          : "We couldn't load this rep."}
      </Centered>
    );
  }

  const rep = repQuery.data;
  if (!rep) return <Centered>Rep not found.</Centered>;

  const inProgress = rep.status === "PENDING" || rep.status === "PROCESSING" || rep.status === "NONE";
  const failed = rep.status === "FAILED";

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your rep</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI analysis of your roleplay against the scoring rubric.
          </p>
        </div>
        {rep.status === "COMPLETE" ? (
          <Badge variant="success">Analysis ready</Badge>
        ) : failed ? (
          <Badge variant="secondary">Scoring failed</Badge>
        ) : (
          <Badge variant="brand">Analysis in progress</Badge>
        )}
      </header>

      {/* Recording player (signed URL). */}
      {rep.recording.url ? (
        <div className="mt-6">
          {rep.recording.videoEnabled ? (
            <video src={rep.recording.url} controls className="w-full rounded-lg border" />
          ) : (
            <audio src={rep.recording.url} controls className="w-full" />
          )}
        </div>
      ) : null}

      {inProgress && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Analysis in progress</CardTitle>
            <CardDescription>
              We&apos;re transcribing the call and scoring it against the rubric. This usually takes a
              few minutes — this page updates automatically when it&apos;s ready.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {failed && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Scoring didn&apos;t finish</CardTitle>
            <CardDescription>
              Something went wrong while scoring this rep{rep.score?.error ? `: ${rep.score.error}` : ""}.
              Try again later — your recording is safe.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {rep.status === "COMPLETE" && rep.score && (
        <ScoreReport score={rep.score} transcript={rep.transcript} />
      )}
    </div>
  );
}

function ScoreReport({
  score,
  transcript,
}: {
  score: RepScore;
  transcript: RepOutput["transcript"];
}) {
  const det = score.deterministic;
  return (
    <>
      {/* Overall + deterministic metrics. */}
      <section className="mt-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <Card className="sm:w-44">
          <CardContent className="pt-6 text-center">
            <div className="text-5xl font-bold">{score.overall ?? "—"}</div>
            <div className="mt-1 text-sm text-muted-foreground">Overall</div>
          </CardContent>
        </Card>
        {det && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Talk time" value={`${det.seller_talk_pct}%`} />
            <Metric label="Words/min" value={`${Math.round(det.wpm)}`} />
            <Metric label="Fillers/min" value={`${det.filler_per_min}`} />
            <Metric label="Longest monologue" value={clock(det.longest_monologue_s)} />
          </div>
        )}
      </section>

      {/* Per-dimension breakdown. */}
      <h2 className="mt-10 text-lg font-semibold">Dimension breakdown</h2>
      <div className="mt-3 space-y-3">
        {score.dimensions.map((d) => (
          <DimensionRow key={d.key} dim={d} />
        ))}
      </div>

      {/* Strengths + growth areas. */}
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <FeedbackList title="Strengths" items={score.strengths} tone="success" />
        <FeedbackList title="Growth areas" items={score.growthAreas} tone="brand" />
      </div>

      {/* Timestamped moments. */}
      {score.moments.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold">Moments</h2>
          <div className="mt-3 space-y-2">
            {score.moments.map((m, i) => (
              <MomentRow key={i} moment={m} />
            ))}
          </div>
        </>
      )}

      {/* Diarized transcript with turn anchors (evidence links scroll here). */}
      {transcript && transcript.turns.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold">Transcript</h2>
          <div className="mt-3 space-y-3 rounded-lg border p-4">
            {transcript.turns.map((t, i) => (
              <p key={i} id={`turn-${i}`} className="scroll-mt-24 text-sm">
                <span className="mr-2 inline-flex items-center gap-2 align-top">
                  <Badge variant="outline">Speaker {t.speaker}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {clock(t.start_s)} · turn {i}
                  </span>
                </span>
                <span className="text-foreground">{t.text}</span>
              </p>
            ))}
          </div>
        </>
      )}

      {score.model && (
        <p className="mt-8 text-xs text-muted-foreground">
          Scored by {score.model}
          {score.rubricVersion ? ` · rubric ${score.rubricVersion}` : ""}.
        </p>
      )}
    </>
  );
}

function DimensionRow({ dim }: { dim: ScoredDimension }) {
  const label = getDimension(dim.key)?.label ?? dim.key;
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{label}</span>
              <Badge variant={dim.kind === "deterministic" ? "outline" : "secondary"}>
                {dim.kind === "deterministic" ? "computed" : "AI-judged"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                weight {Math.round(dim.weight * 100)}%
              </span>
            </div>
            {dim.comment && <p className="mt-1 text-sm text-muted-foreground">{dim.comment}</p>}
            {dim.evidence.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dim.evidence.map((ref) => {
                  const i = turnIndex(ref);
                  return i === null ? (
                    <Badge key={ref} variant="outline">
                      {ref}
                    </Badge>
                  ) : (
                    <button
                      key={ref}
                      type="button"
                      onClick={() => scrollToTurn(i)}
                      className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      turn {i}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Badge variant={scoreTone(dim.score)} className="shrink-0 text-sm">
            {dim.score}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function MomentRow({ moment }: { moment: Moment }) {
  // Moments carry timestamps (not turn refs); the transcript turns show matching
  // timestamps, so no per-moment jump link here.
  return (
    <div className="flex items-start gap-3 rounded-md border p-3 text-sm">
      <Badge variant={moment.label === "good" ? "success" : "secondary"} className="shrink-0">
        {moment.label === "good" ? "Good" : "Missed"}
      </Badge>
      <span className="font-mono text-xs text-muted-foreground">
        {clock(moment.t_start_s)}–{clock(moment.t_end_s)}
      </span>
      <span className="flex-1">
        <span className="text-muted-foreground">
          {getDimension(moment.dimension)?.label ?? moment.dimension}:{" "}
        </span>
        {moment.note}
      </span>
    </div>
  );
}

function FeedbackList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "brand";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None noted.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className={tone === "success" ? "text-green-600" : "text-indigo-600"}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-20 text-center text-muted-foreground">{children}</div>
  );
}

"use client";

import "@livekit/components-styles";
import { useState } from "react";
import Link from "next/link";
import { LiveKitRoom, PreJoin, type LocalUserChoices } from "@livekit/components-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CallStage } from "./call-stage";

type Phase = "lobby" | "incall" | "postcall";

const ROLE_COPY: Record<string, { label: string; brief: string }> = {
  seller: {
    label: "Seller",
    brief: "You're running the call. Open strong, uncover need, and drive to a next step.",
  },
  counterpart: {
    label: "Counterpart (Buyer)",
    brief: "You're the prospect. Play a realistic buyer and make them earn it.",
  },
  invitee: {
    label: "Joining",
    brief: "You'll take the counterpart (buyer) seat.",
  },
};

export function CallExperience({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC();

  const consentQuery = useQuery(trpc.consent.status.queryOptions());
  const sessionQuery = useQuery(trpc.roleplay.getSession.queryOptions({ sessionId }));

  const acceptConsent = useMutation(
    trpc.consent.accept.mutationOptions({ onSuccess: () => consentQuery.refetch() }),
  );
  const getToken = useMutation(trpc.roleplay.getJoinToken.mutationOptions());
  const markLive = useMutation(trpc.roleplay.markLive.mutationOptions());
  const endSession = useMutation(trpc.roleplay.endSession.mutationOptions());

  const [conn, setConn] = useState<{
    token: string;
    serverUrl: string;
    choices: LocalUserChoices;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [recording, setRecording] = useState(false);

  if (consentQuery.isLoading || sessionQuery.isLoading) {
    return <CenteredMessage>Loading call…</CenteredMessage>;
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    return <CenteredMessage>This call could not be found.</CenteredMessage>;
  }
  const session = sessionQuery.data;

  if (session.status === "ENDED" && phase !== "postcall") {
    return <PostCall sessionId={sessionId} />;
  }

  // Consent gate (FR-18).
  if (consentQuery.data && !consentQuery.data.accepted) {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle>Recording consent</CardTitle>
          <CardDescription>Required before joining a call.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{consentQuery.data.text}</p>
          <Button
            disabled={acceptConsent.isPending}
            onClick={() => acceptConsent.mutate({ version: consentQuery.data!.version })}
          >
            {acceptConsent.isPending ? "Saving…" : "I consent — continue"}
          </Button>
        </CardContent>
      </CenteredCard>
    );
  }

  if (phase === "postcall") {
    return <PostCall sessionId={sessionId} />;
  }

  // Lobby: device selection (PreJoin) + role/brief placeholder + Join.
  if (phase === "lobby" || !conn) {
    const role = ROLE_COPY[session.role] ?? ROLE_COPY.invitee;
    return (
      <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-8 p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Roleplay lobby</h1>
            <p className="mt-1 text-muted-foreground">
              {session.videoEnabled ? "Video" : "Audio-only"} call · {session.durationMinutes} min.
            </p>
          </div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Your role</CardTitle>
                <Badge variant="brand">{role.label}</Badge>
              </div>
              <CardDescription>Scenario brief</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{role.brief}</p>
              <p className="rounded-md bg-muted px-3 py-2 text-xs">
                Scenario briefs are a placeholder for now — the scenario library arrives in a later
                phase.
              </p>
            </CardContent>
          </Card>
          {!session.counterpart && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(window.location.href)}
            >
              Copy invite link
            </Button>
          )}
        </div>

        <div data-lk-theme="default" className="w-full">
          <PreJoin
            joinLabel="Join"
            defaults={{ videoEnabled: session.videoEnabled, audioEnabled: true }}
            onError={(e) => console.error(e)}
            onSubmit={async (choices) => {
              const res = await getToken.mutateAsync({ sessionId });
              setConn({ token: res.token, serverUrl: res.serverUrl, choices });
              setPhase("incall");
            }}
          />
        </div>
      </div>
    );
  }

  // Live call.
  return (
    <div data-lk-theme="default" className="h-screen w-screen">
      <LiveKitRoom
        token={conn.token}
        serverUrl={conn.serverUrl}
        connect
        video={conn.choices.videoEnabled}
        audio={conn.choices.audioEnabled}
        options={{
          videoCaptureDefaults: { deviceId: conn.choices.videoDeviceId },
          audioCaptureDefaults: { deviceId: conn.choices.audioDeviceId },
        }}
        onConnected={async () => {
          try {
            const res = await markLive.mutateAsync({ sessionId });
            setStartedAt(res.startedAt ?? new Date());
            setRecording(res.recordingStatus === "RECORDING");
          } catch {
            setStartedAt(new Date());
          }
        }}
        onDisconnected={async () => {
          setPhase("postcall");
          try {
            await endSession.mutateAsync({ sessionId });
          } catch {
            // already ended elsewhere
          }
        }}
      >
        <CallStage
          durationMinutes={session.durationMinutes}
          startedAt={startedAt}
          recording={recording}
        />
      </LiveKitRoom>
    </div>
  );
}

function PostCall({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC();
  const getRecordingUrl = useMutation(trpc.roleplay.getRecordingUrl.mutationOptions());
  const [url, setUrl] = useState<string | null>(null);

  return (
    <CenteredCard>
      <CardHeader>
        <CardTitle>Call ended</CardTitle>
        <CardDescription>Nice work — your roleplay is complete.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-dashed p-5 text-center">
          <div className="text-sm font-medium">AI analysis & scoring</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Coming soon — transcription and rubric scoring land in Phase 2.
          </p>
        </div>

        {url ? (
          <video src={url} controls className="w-full rounded-md border" />
        ) : (
          <Button
            variant="outline"
            className="w-full"
            disabled={getRecordingUrl.isPending}
            onClick={async () => {
              const res = await getRecordingUrl.mutateAsync({ sessionId });
              setUrl(res.url);
            }}
          >
            {getRecordingUrl.isPending ? "Preparing…" : "Review recording"}
          </Button>
        )}
        {getRecordingUrl.isError && (
          <p className="text-sm text-muted-foreground">
            Recording isn’t ready yet — it finishes processing a few seconds after the call.
          </p>
        )}

        <Button asChild variant="ghost" className="w-full">
          <Link href="/roleplays">Back to Roleplays</Link>
        </Button>
      </CardContent>
    </CenteredCard>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">
      {children}
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

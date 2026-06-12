"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { DEFAULT_CALL_MINUTES } from "@sr/core";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const DURATIONS = [5, 10, 15, 30] as const;

export function RoleplayStart() {
  const trpc = useTRPC();
  const router = useRouter();
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState<number>(DEFAULT_CALL_MINUTES);

  const createSession = useMutation(
    trpc.roleplay.createSession.mutationOptions({
      onSuccess: (res) => router.push(`/call/${res.sessionId}`),
    }),
  );

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Start a roleplay call</CardTitle>
        <CardDescription>
          Create a room, then share the invite link with one other person to join.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">Video</span>
          <input
            type="checkbox"
            checked={videoEnabled}
            onChange={(e) => setVideoEnabled(e.target.checked)}
            className="size-4"
          />
        </label>

        <div className="space-y-2">
          <Label>Duration</Label>
          <div className="flex gap-2">
            {DURATIONS.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={durationMinutes === m ? "default" : "outline"}
                onClick={() => setDurationMinutes(m)}
              >
                {m}m
              </Button>
            ))}
          </div>
        </div>

        {createSession.isError && (
          <p className="text-sm text-destructive">{createSession.error.message}</p>
        )}

        <Button
          className="w-full"
          disabled={createSession.isPending}
          onClick={() => createSession.mutate({ videoEnabled, durationMinutes })}
        >
          {createSession.isPending ? "Creating…" : "Start call"}
        </Button>
      </CardContent>
    </Card>
  );
}

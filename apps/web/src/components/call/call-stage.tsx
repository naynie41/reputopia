"use client";

import { useEffect, useState } from "react";
import {
  ConnectionQualityIndicator,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Circle, Mic, PhoneOff, Video as VideoIcon } from "lucide-react";
import { CALL_WARNING_SECONDS } from "@sr/core";
import { cn } from "@/lib/utils";

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

/**
 * Custom in-call stage (must live inside <LiveKitRoom>). Renders local + remote
 * camera tiles (each ParticipantTile shows name, mic state, and connection quality),
 * a control bar (mic/camera toggles, local connection-quality indicator, End), a
 * top overlay (shared countdown with T-60s warning + recording indicator), and the
 * RoomAudioRenderer that plays remote audio.
 */
export function CallStage({
  durationMinutes,
  startedAt,
  recording,
}: {
  durationMinutes: number;
  startedAt: Date | null;
  recording: boolean;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  // Camera tracks for everyone (placeholder tile shown when a camera is off).
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });

  const [remaining, setRemaining] = useState(durationMinutes * 60);
  useEffect(() => {
    if (!startedAt) return;
    const endMs = startedAt.getTime() + durationMinutes * 60_000;
    const tick = () => setRemaining(Math.round((endMs - Date.now()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, durationMinutes]);

  const warning = remaining <= CALL_WARNING_SECONDS && remaining > 0;
  const expired = remaining <= 0;

  return (
    <div className="relative flex h-screen flex-col bg-neutral-950 text-white">
      {/* Top overlay: recording + timer */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        {recording ? (
          <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium">
            <Circle className="size-2.5 animate-pulse fill-red-500 text-red-500" />
            Recording
          </span>
        ) : (
          <span />
        )}
        <span
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium tabular-nums",
            expired ? "bg-red-600" : warning ? "bg-amber-500" : "bg-black/60",
          )}
        >
          {expired ? "Time's up" : formatClock(remaining)}
        </span>
      </div>

      {/* Video tiles */}
      <div className="min-h-0 flex-1 p-2">
        <GridLayout tracks={tracks} className="h-full">
          <ParticipantTile />
        </GridLayout>
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-neutral-900 px-4 py-3">
        <TrackToggle
          source={Track.Source.Microphone}
          className="flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          <Mic className="size-4" />
          Mic
        </TrackToggle>
        <TrackToggle
          source={Track.Source.Camera}
          className="flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          <VideoIcon className="size-4" />
          Camera
        </TrackToggle>

        <span className="mx-1 flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-2 text-xs text-white/70">
          Connection
          <ConnectionQualityIndicator participant={localParticipant} />
        </span>

        <button
          type="button"
          onClick={() => room.disconnect()}
          className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-700"
        >
          <PhoneOff className="size-4" />
          End call
        </button>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}

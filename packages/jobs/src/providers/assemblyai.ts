import { AssemblyAI, type Transcript } from "assemblyai";
import { serverEnv } from "@sr/config/env.server";
import type { DiarizedTranscript } from "@sr/core";

/**
 * AssemblyAI batch transcription with speaker diarization (PRD §9.3). We use
 * submit + poll (not the SDK's blocking `transcribe()`) so the wait happens across
 * durable Inngest steps rather than inside one long serverless invocation.
 *
 * Times from AssemblyAI are in MILLISECONDS; we normalize to seconds for @sr/core.
 */
const client = new AssemblyAI({ apiKey: serverEnv.ASSEMBLYAI_API_KEY });

/** Submit a remote audio URL for diarized transcription. Returns immediately (queued). */
export async function submitTranscript(audioUrl: string): Promise<Transcript> {
  return client.transcripts.submit({
    audio: audioUrl,
    speaker_labels: true, // diarization (who said what)
    sentiment_analysis: true, // extra coaching signal (PRD §9.3)
  });
}

/** Fetch the current state of a submitted transcript by id (for polling). */
export async function getTranscript(id: string): Promise<Transcript> {
  return client.transcripts.get(id);
}

export type TranscriptStatusValue = Transcript["status"]; // "queued" | "processing" | "completed" | "error"

/** Normalize a completed AssemblyAI transcript into the @sr/core diarized shape. */
export function normalizeTranscript(t: Transcript): DiarizedTranscript {
  const utterances = t.utterances ?? [];
  const turns = utterances.map((u) => ({
    speaker: u.speaker,
    text: u.text,
    start_s: u.start / 1000,
    end_s: u.end / 1000,
  }));

  const speakers: string[] = [];
  for (const turn of turns) {
    if (!speakers.includes(turn.speaker)) speakers.push(turn.speaker);
  }

  const lastTurn = turns[turns.length - 1];
  const durationS = t.audio_duration ?? lastTurn?.end_s ?? 0;

  return { turns, duration_s: durationS, speakers };
}

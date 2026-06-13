import { NextResponse, type NextRequest } from "next/server";
import { EgressStatus } from "livekit-server-sdk";
import { prisma } from "@sr/db";
import { inngest } from "@sr/jobs";
import { receiveWebhook } from "@/server/livekit";

/**
 * LiveKit webhook. Per the architecture rules this does MINIMAL work: verify the
 * signature, then persist room/egress state and enqueue the async pipeline. No
 * transcription/scoring runs here (it would time out) — that lives in Inngest.
 *
 * Phase 2: when egress completes (recording READY in R2) we emit `session/ended` to
 * Inngest, which runs transcription -> metrics -> scoring -> persist. We trigger on
 * egress-complete (not room_finished) because scoring needs the finished recording.
 *
 * Idempotent: all writes are conditional `updateMany` by roomId, and the emitted event
 * carries a per-session id so redelivered webhooks don't double-trigger the pipeline.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const authHeader = req.headers.get("authorization");

  let event;
  try {
    event = await receiveWebhook(rawBody, authHeader);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.event) {
    case "room_finished": {
      const roomId = event.room?.name;
      if (roomId) {
        await prisma.session.updateMany({
          where: { roomId, status: { not: "ENDED" } },
          data: { status: "ENDED", endedAt: new Date() },
        });
      }
      break;
    }

    case "egress_started": {
      const roomId = event.egressInfo?.roomName;
      if (roomId) {
        await prisma.session.updateMany({
          where: { roomId },
          data: { recordingStatus: "RECORDING", egressId: event.egressInfo?.egressId },
        });
      }
      break;
    }

    case "egress_ended":
    case "egress_updated": {
      const info = event.egressInfo;
      const roomId = info?.roomName;
      if (roomId && info) {
        const done = info.status === EgressStatus.EGRESS_COMPLETE;
        const failed =
          info.status === EgressStatus.EGRESS_FAILED ||
          info.status === EgressStatus.EGRESS_ABORTED;
        if (done || failed) {
          const recordingKey = info.fileResults?.[0]?.filename;
          await prisma.session.updateMany({
            where: { roomId },
            data: {
              recordingStatus: done ? "READY" : "FAILED",
              ...(done && recordingKey ? { recordingKey } : {}),
            },
          });

          // Recording is in R2 — kick off the async scoring pipeline. Look up the
          // session id (the webhook keys on roomId) and emit once per session; the
          // event id dedupes redelivered egress webhooks.
          if (done && recordingKey) {
            const session = await prisma.session.findUnique({
              where: { roomId },
              select: { id: true },
            });
            if (session) {
              await inngest.send({
                id: `session-ended-${session.id}`,
                name: "session/ended",
                data: { sessionId: session.id },
              });
            }
          }
        }
      }
      break;
    }

    default:
      // participant_joined/left and others: no-op in Phase 1.
      break;
  }

  return NextResponse.json({ received: true });
}

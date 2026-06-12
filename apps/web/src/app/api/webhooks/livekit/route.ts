import { NextResponse, type NextRequest } from "next/server";
import { EgressStatus } from "livekit-server-sdk";
import { prisma } from "@sr/db";
import { receiveWebhook } from "@/server/livekit";

/**
 * LiveKit webhook. Per the architecture rules this does MINIMAL work: verify the
 * signature, then persist room/egress state. No transcription/scoring here.
 *
 * Phase 2 SEAM: on `room_finished` we will additionally emit a `session.ended` event
 * to Inngest to kick off the async transcription/scoring pipeline. Not wired yet.
 *
 * Idempotent: all writes are conditional `updateMany` by roomId, so redelivered
 * events are safe.
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
        // Phase 2 SEAM: enqueue Inngest `session.ended` here.
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

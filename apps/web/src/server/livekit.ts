import "server-only";
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  RoomServiceClient,
  S3Upload,
  WebhookReceiver,
} from "livekit-server-sdk";
import { serverEnv } from "@sr/config/env.server";

// Server SDK clients talk to the LiveKit HTTP API; convert the public wss:// URL.
const livekitHost = serverEnv.NEXT_PUBLIC_LIVEKIT_URL.replace(/^wss:/, "https:").replace(
  /^ws:/,
  "http:",
);

const roomService = new RoomServiceClient(
  livekitHost,
  serverEnv.LIVEKIT_API_KEY,
  serverEnv.LIVEKIT_API_SECRET,
);
const egressClient = new EgressClient(
  livekitHost,
  serverEnv.LIVEKIT_API_KEY,
  serverEnv.LIVEKIT_API_SECRET,
);

/** Mint a join token (JWT) for a participant. `toJwt()` is async in SDK v2. */
export async function createAccessToken(opts: {
  room: string;
  identity: string;
  name?: string;
}): Promise<string> {
  const at = new AccessToken(serverEnv.LIVEKIT_API_KEY, serverEnv.LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.name,
  });
  at.addGrant({ roomJoin: true, room: opts.room, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

const r2Endpoint = `https://${serverEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

/**
 * Start recording a room to the private R2 bucket via Room Composite Egress.
 * Audio is always captured; video only when enabled. Returns the egress id and the
 * R2 object key (never served directly — only via short-lived signed URLs).
 */
export async function startRecording(opts: {
  room: string;
  videoEnabled: boolean;
}): Promise<{ egressId: string; recordingKey: string }> {
  // MP4 (AAC) for audio+video; OGG (Opus) for audio-only, per LiveKit egress docs.
  const recordingKey = `recordings/${opts.room}.${opts.videoEnabled ? "mp4" : "ogg"}`;
  const fileOutput = new EncodedFileOutput({
    filepath: recordingKey,
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: serverEnv.R2_ACCESS_KEY_ID,
        secret: serverEnv.R2_SECRET_ACCESS_KEY,
        bucket: serverEnv.R2_BUCKET,
        region: "auto",
        endpoint: r2Endpoint,
        forcePathStyle: true, // required for non-AWS S3-compatible storage (R2)
      }),
    },
  });

  const info = await egressClient.startRoomCompositeEgress(
    opts.room,
    { file: fileOutput },
    { audioOnly: !opts.videoEnabled },
  );
  return { egressId: info.egressId, recordingKey };
}

export async function stopRecording(egressId: string): Promise<void> {
  await egressClient.stopEgress(egressId);
}

/** Close the LiveKit room (disconnects everyone). */
export async function closeRoom(room: string): Promise<void> {
  await roomService.deleteRoom(room);
}

const webhookReceiver = new WebhookReceiver(
  serverEnv.LIVEKIT_API_KEY,
  serverEnv.LIVEKIT_API_SECRET,
);

/** Verify + decode a LiveKit webhook. Throws if the signature is invalid. */
export async function receiveWebhook(rawBody: string, authHeader: string | null) {
  return webhookReceiver.receive(rawBody, authHeader ?? undefined);
}

import "server-only";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "@sr/config/env.server";

// Cloudflare R2 is S3-compatible: region "auto", account-scoped endpoint, path-style.
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${serverEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
  },
});

/** Short-lived signed URL for a private recording (CLAUDE.md: never serve directly). */
export async function getSignedPlaybackUrl(key: string, expiresInSeconds = 300): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: serverEnv.R2_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

/** Hard-delete a recording object (supports the GDPR delete path; Phase 2+ cascade). */
export async function deleteRecording(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: serverEnv.R2_BUCKET, Key: key }));
}

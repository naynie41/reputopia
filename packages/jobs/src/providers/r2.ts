import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "@sr/config/env.server";

/**
 * Short-lived signed GET URL for a private recording, used to hand the audio to
 * AssemblyAI without making the R2 bucket public (CLAUDE.md security rule). The TTL
 * is generous (1h) because AssemblyAI fetches the file once when the job starts; the
 * URL never reaches the browser.
 *
 * This mirrors apps/web/src/server/r2.ts but lives here so the jobs package has no
 * dependency on the web app. R2 is S3-compatible: region "auto", account-scoped
 * endpoint, path-style.
 */
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${serverEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID,
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY,
  },
});

export async function getSignedRecordingUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: serverEnv.R2_BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

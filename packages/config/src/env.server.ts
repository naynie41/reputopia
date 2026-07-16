import { z } from "zod";

/**
 * Server-side environment, validated at boot. A missing/invalid var throws here
 * so the process fails fast instead of erroring deep in a request.
 *
 * NEVER import this from a Client Component — it parses secrets. Client code must
 * import from `@sr/config/env.client` instead.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Clerk
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1, "CLERK_WEBHOOK_SIGNING_SECRET is required"),

  // Neon Postgres — pooled at runtime, direct only for migrations.
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid Postgres connection string"),
  DIRECT_URL: z.string().url("DIRECT_URL must be a valid Postgres connection string"),

  // LiveKit (Phase 1: live calls + Egress recording). Public URL is also validated
  // here so server code can read it from the validated config.
  NEXT_PUBLIC_LIVEKIT_URL: z.string().url("NEXT_PUBLIC_LIVEKIT_URL must be a wss:// URL"),
  LIVEKIT_API_KEY: z.string().min(1, "LIVEKIT_API_KEY is required"),
  LIVEKIT_API_SECRET: z.string().min(1, "LIVEKIT_API_SECRET is required"),

  // Cloudflare R2 (private recordings bucket; S3-compatible). Endpoint is derived
  // from the account id: https://<account>.r2.cloudflarestorage.com
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET: z.string().min(1, "R2_BUCKET is required"),

  // Phase 2: async scoring pipeline (@sr/jobs).
  // AssemblyAI batch transcription + Anthropic scoring — required for the pipeline to run.
  ASSEMBLYAI_API_KEY: z.string().min(1, "ASSEMBLYAI_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  // Inngest cloud keys: OPTIONAL — the local Inngest dev server doesn't use them.
  // Required only in deployed environments (set in Vercel per the DevOps handover).
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // Phase 3: Upstash Redis (matchmaking queue). REST-based; required to run the queue.
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be a valid URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
});

function loadServerEnv(): z.infer<typeof serverSchema> {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`❌ Invalid server environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const serverEnv = loadServerEnv();

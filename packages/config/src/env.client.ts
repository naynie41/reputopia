import { z } from "zod";

/**
 * Client-safe environment (only NEXT_PUBLIC_* vars). Safe to import anywhere.
 *
 * Each var is referenced LITERALLY below so Next's bundler can inline it into the
 * client bundle — `process.env[dynamicKey]` would NOT be inlined.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),
  NEXT_PUBLIC_LIVEKIT_URL: z.string().url("NEXT_PUBLIC_LIVEKIT_URL must be a wss:// URL"),
});

const clientRuntime = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
};

function loadClientEnv(): z.infer<typeof clientSchema> {
  const parsed = clientSchema.safeParse(clientRuntime);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`❌ Invalid public environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const clientEnv = loadClientEnv();

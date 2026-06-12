import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Single source of truth: load the monorepo-root .env so Next (and the validated
// env in @sr/config) see the same vars as the Prisma CLI. Vars already in the real
// environment (e.g. Vercel) take precedence and are not overridden.
loadEnv({ path: path.resolve(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  // Workspace packages ship as TypeScript source; let Next transpile them.
  transpilePackages: ["@sr/config", "@sr/core", "@sr/db"],
  // Keep Prisma + its driver adapter and the heavy server SDKs out of the bundle.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "livekit-server-sdk",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
  ],
};

export default nextConfig;

import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Load the repo-root .env so the Prisma CLI sees the same vars as the app.
loadEnv({ path: "../../.env" });

/**
 * Prisma 7 CLI config. The `datasource.url` here is used by the CLI for migrations,
 * so it MUST be the DIRECT (non-pooled) connection. The app runtime uses the POOLED
 * `DATABASE_URL` via the Neon driver adapter in src/index.ts.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});

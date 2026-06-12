import { PrismaClient } from "../generated/client/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { serverEnv } from "@sr/config/env.server";

/**
 * Prisma 7 client singleton. Prisma 7 requires a driver adapter; we use the Neon
 * serverless adapter with the POOLED `DATABASE_URL` at runtime (migrations use the
 * direct `DIRECT_URL` via prisma.config.ts). The global cache prevents exhausting
 * Neon connections during dev hot-reload.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaNeon({ connectionString: serverEnv.DATABASE_URL });

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: serverEnv.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (serverEnv.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export generated types + enums so app code imports everything from "@sr/db".
export * from "../generated/client/client";

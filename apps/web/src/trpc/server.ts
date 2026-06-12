import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createCallerFactory, createTRPCContext } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/root";

/**
 * Server-side tRPC caller for React Server Components, so RSC reads go through the
 * same type-safe tRPC layer as the client (no ad-hoc Prisma calls in pages).
 * `cache` dedupes the context + caller within a single request.
 */
const getContext = cache(async () => {
  const incoming = await headers();
  return createTRPCContext({ headers: new Headers(Object.fromEntries(incoming.entries())) });
});

export const getServerApi = cache(async () => {
  return createCallerFactory(appRouter)(await getContext());
});

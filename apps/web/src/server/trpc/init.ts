import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@sr/db";

/**
 * tRPC context — built per request. Carries the Prisma client and the Clerk auth
 * state (userId/orgId/orgRole). Authorization is enforced in procedures below, not
 * just in the UI (per the CLAUDE.md "authorize every read" rule).
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  const clerkAuth = await auth();
  return { prisma, clerkAuth, headers: opts.headers };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

/** Requires an authenticated Clerk user; narrows `userId` to a non-null string. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.clerkAuth.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "You must be signed in." });
  }
  return next({
    ctx: {
      ...ctx,
      clerkAuth: { ...ctx.clerkAuth, userId: ctx.clerkAuth.userId },
    },
  });
});

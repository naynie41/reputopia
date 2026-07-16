import { sessionIdInputSchema } from "@sr/core";
import { createTRPCRouter, protectedProcedure } from "../init";
import { ensureDbUser } from "../../users";
import { getLobbyView, setReady } from "../../lobby";

/**
 * Match lobby (PRD FR-11). Authorization is enforced in the data layer (getLobbyView /
 * setReady): only a session's participants may read it, and each caller only ever
 * receives their OWN brief.
 */
export const lobbyRouter = createTRPCRouter({
  /** Lobby view for the caller: role, own brief, shared context, ready states. */
  get: protectedProcedure.input(sessionIdInputSchema).query(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    return getLobbyView(ctx.prisma, input.sessionId, user.id);
  }),

  /** Mark the caller ready; returns whether both participants are now ready. */
  ready: protectedProcedure.input(sessionIdInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ensureDbUser(ctx.clerkAuth.userId);
    return setReady(ctx.prisma, input.sessionId, user.id);
  }),
});

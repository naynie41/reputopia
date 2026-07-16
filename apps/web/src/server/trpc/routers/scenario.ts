import { TRPCError } from "@trpc/server";
import { Prisma } from "@sr/db";
import {
  getScenarioWeights,
  scenarioCreateInputSchema,
  scenarioListInputSchema,
  scenarioSetActiveInputSchema,
} from "@sr/core";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../init";

/**
 * Scenario library (PRD §5.2). Reads are open to any signed-in user (they browse to pick
 * a scenario to queue for, FR-8); create/deactivate are admin-only (FR-7). Full admin UI
 * comes later — seed + read + basic create/deactivate is enough for matchmaking now.
 */
export const scenarioRouter = createTRPCRouter({
  /** Browse/filter the library by track and/or difficulty (FR-8). Active-only by default. */
  list: protectedProcedure.input(scenarioListInputSchema).query(async ({ ctx, input }) => {
    return ctx.prisma.scenario.findMany({
      where: {
        ...(input.includeInactive ? {} : { active: true }),
        ...(input.track ? { track: input.track } : {}),
        ...(input.difficulty ? { difficulty: input.difficulty } : {}),
      },
      orderBy: [{ track: "asc" }, { difficulty: "asc" }, { title: "asc" }],
    });
  }),

  /** Admin: create a scenario (FR-7). `rubricWeights` defaults to the track preset. */
  create: adminProcedure.input(scenarioCreateInputSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.scenario.findUnique({ where: { slug: input.slug } });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `A scenario with slug "${input.slug}" already exists.`,
      });
    }
    const rubricWeights = (input.rubricWeights ??
      { ...getScenarioWeights(input.track) }) as Prisma.InputJsonValue;

    return ctx.prisma.scenario.create({
      data: {
        slug: input.slug,
        track: input.track,
        difficulty: input.difficulty,
        title: input.title,
        context: input.context,
        sellerObjective: input.sellerObjective,
        counterpartPersona: input.counterpartPersona,
        durationS: input.durationS,
        rubricWeights,
        active: input.active,
      },
    });
  }),

  /** Admin: deactivate / reactivate a scenario (soft delete — keeps history resolvable). */
  setActive: adminProcedure
    .input(scenarioSetActiveInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.scenario.update({
          where: { id: input.id },
          data: { active: input.active },
        });
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found." });
      }
    }),
});

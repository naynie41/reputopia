import { createTRPCRouter } from "./init";
import { profileRouter } from "./routers/profile";
import { callRouter } from "./routers/call";
import { consentRouter } from "./routers/consent";
import { scoreRouter } from "./routers/score";
import { scenarioRouter } from "./routers/scenario";
import { matchmakingRouter } from "./routers/matchmaking";
import { lobbyRouter } from "./routers/lobby";

export const appRouter = createTRPCRouter({
  profile: profileRouter,
  roleplay: callRouter,
  consent: consentRouter,
  score: scoreRouter,
  scenario: scenarioRouter,
  matchmaking: matchmakingRouter,
  lobby: lobbyRouter,
});

export type AppRouter = typeof appRouter;

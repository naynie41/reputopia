import { createTRPCRouter } from "./init";
import { profileRouter } from "./routers/profile";
import { callRouter } from "./routers/call";
import { consentRouter } from "./routers/consent";
import { scoreRouter } from "./routers/score";

export const appRouter = createTRPCRouter({
  profile: profileRouter,
  roleplay: callRouter,
  consent: consentRouter,
  score: scoreRouter,
});

export type AppRouter = typeof appRouter;

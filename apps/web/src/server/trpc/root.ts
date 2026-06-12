import { createTRPCRouter } from "./init";
import { profileRouter } from "./routers/profile";
import { callRouter } from "./routers/call";
import { consentRouter } from "./routers/consent";

export const appRouter = createTRPCRouter({
  profile: profileRouter,
  roleplay: callRouter,
  consent: consentRouter,
});

export type AppRouter = typeof appRouter;

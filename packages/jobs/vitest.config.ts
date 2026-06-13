import { defineConfig } from "vitest/config";

// Load the monorepo-root .env before any test module is evaluated, so provider modules
// (which import the validated @sr/config env at import time) can load. The live
// calibration test still skips itself unless a real ANTHROPIC_API_KEY is present.
export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});

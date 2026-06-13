import { serve } from "inngest/next";
import { functions, inngest } from "@sr/jobs";

/**
 * Inngest serve endpoint (DevOps handover §8). Hosts all async-pipeline functions;
 * Inngest auto-discovers them here on deploy. Locally, run the dev server with
 * `npx inngest-cli dev` pointed at http://localhost:3000/api/inngest.
 *
 * Signature verification uses INNGEST_SIGNING_KEY (optional locally, required in
 * deployed environments) — the SDK reads it from the environment.
 */
export const { GET, POST, PUT } = serve({ client: inngest, functions });

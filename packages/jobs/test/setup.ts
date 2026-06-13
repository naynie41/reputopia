import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Best-effort load of the monorepo-root .env (no-op if absent — CI provides env vars
// directly). Runs before test modules import @sr/config's validated env.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

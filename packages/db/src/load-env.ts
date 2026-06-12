import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Side-effect module: load the monorepo-root .env into process.env. Import this
// FIRST (before importing the Prisma client) in standalone Node scripts like the
// seed, which otherwise have no env loaded. Next.js loads env via next.config.ts,
// and the Prisma CLI via prisma.config.ts — so neither imports this.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

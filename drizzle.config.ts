/**
 * drizzle-kit configuration.
 *
 * Schema source of truth lives at `src/persistence/sqlite/schema/*.ts`.
 * Generated migrations land at `./drizzle/`. Both directories commit to git.
 *
 * Migration generation runs at dev/CI time:
 *   pnpm drizzle-kit generate    → emits drizzle/NNNN_*.sql
 *   pnpm drizzle-kit check       → verifies schema matches committed migrations
 *
 * See docs/DB.md for the full build-time / test-time / runtime architecture.
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/persistence/sqlite/schema/*",
	out: "./drizzle",
});

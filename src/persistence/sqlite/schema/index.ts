/**
 * Drizzle schema barrel for chonkers' SQL data model.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Consumers (repos, drizzle-kit, build-time `scripts/build-game-db.mjs`,
 * test-time `makeTestDb`) import the schema as a namespace:
 *
 *   import * as schema from "@/persistence/sqlite/schema";
 *   const db = drizzle(handle, { schema });
 */

export * from "./aiStates";
export * from "./analyticsAggregates";
export * from "./matches";
export * from "./moves";

/**
 * Shared drizzle handle type for repos.
 *
 * Repos accept any drizzle SQLite handle that knows about chonkers'
 * schema. In production live code that's `ChonkersDb` (drizzle's
 * sqlite-proxy driver wrapping `@capacitor-community/sqlite`); in
 * tests it's the better-sqlite3 driver via `makeTestDb()`. Both
 * implement the same drizzle query-builder surface, so repos type
 * against the union via `BaseSQLiteDatabase`'s generic.
 *
 * See docs/DB.md "Repos" + "Test strategy" for context.
 */

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "@/persistence/sqlite/schema";

/**
 * Any drizzle SQLite handle that exposes the chonkers schema. Both
 * the runtime sqlite-proxy handle and the test better-sqlite3 handle
 * satisfy this type.
 */
export type StoreDb = BaseSQLiteDatabase<
	"async" | "sync",
	unknown,
	typeof schema
>;

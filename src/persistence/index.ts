/**
 * src/persistence — chonkers' durable storage layer.
 *
 * Two child packages, named for the platform mechanism that backs each:
 *
 *   • preferences/  — typed JSON kv over @capacitor/preferences
 *   • sqlite/       — drizzle ORM + @capacitor-community/sqlite
 *                     (build-time game.db + runtime version-replay)
 *
 * Consumers import from the child packages directly:
 *
 *   import { kv } from '@/persistence/preferences';
 *   import { db } from '@/persistence/sqlite';
 *
 * The top-level barrel re-exports both for convenience.
 *
 * See docs/PERSISTENCE.md (kv) and docs/DB.md (sqlite) for contracts.
 */

export { kv } from "./preferences";
export * from "./sqlite";

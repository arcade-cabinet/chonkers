/**
 * src/persistence — generic Capacitor-backed transport.
 *
 * Two surfaces:
 *   • kv  — typed JSON key-value over @capacitor/preferences
 *   • db  — raw SQL transport over @capacitor-community/sqlite +
 *           jeep-sqlite (web fallback)
 *
 * Zero knowledge of game-specific concepts. Schema and typed data
 * access live in src/schema/ and src/store/ (separate packages).
 *
 * See docs/PERSISTENCE.md for the full contract.
 */

export { type DbConnection, db } from "./db";
export { kv } from "./kv";

/**
 * Node-tier test database factory.
 *
 * `makeTestDb()` returns a fresh, isolated SQLite database with every
 * committed migration applied. Each call is independent; no shared
 * state between tests; no cleanup hooks needed.
 *
 * Resolution order for the database location:
 *
 *   1. Explicit `path: string` argument → write to that path. Parent
 *      directories are created if missing. The file is left on disk
 *      after the test finishes.
 *
 *   2. Otherwise, env var `CHONKERS_TEST_DB_DIR` set → write to
 *      `${CHONKERS_TEST_DB_DIR}/<random>.db`. Useful for debugging
 *      a failing test: set the env var, re-run, then inspect the
 *      DB file with `sqlite3 path/to/foo.db`.
 *
 *   3. Otherwise (the default) → in-memory `:memory:`. Throwaway,
 *      dies with the connection, fast.
 *
 * See docs/DB.md "Test time" section.
 */

import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3, { type Database as SqlDatabase } from "better-sqlite3";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const migrationsDir = join(repoRoot, "drizzle");

/**
 * Sorted list of `<repo>/drizzle/NNNN_*.sql` migration paths,
 * resolved once on first call and cached.
 */
let cachedMigrations: readonly string[] | null = null;

function listMigrations(): readonly string[] {
	if (cachedMigrations) return cachedMigrations;
	const files = readdirSync(migrationsDir)
		.filter((f) => /^\d{4}_.*\.sql$/.test(f))
		.sort();
	cachedMigrations = files.map((f) => join(migrationsDir, f));
	return cachedMigrations;
}

/**
 * Apply every committed migration to a raw better-sqlite3 connection.
 * Statements are split on the drizzle-kit `--> statement-breakpoint`
 * marker and executed in order. PRAGMA user_version is bumped to the
 * count of applied migrations.
 */
function applyMigrations(sqlDb: SqlDatabase): number {
	const files = listMigrations();
	let applied = 0;
	for (const path of files) {
		const sql = readFileSync(path, "utf8");
		const statements = sql
			.split(/--> statement-breakpoint/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		for (const stmt of statements) sqlDb.exec(stmt);
		applied += 1;
	}
	sqlDb.pragma(`user_version = ${applied}`);
	return applied;
}

export interface TestDbOptions {
	/**
	 * Explicit path to write the database file to. Created if missing.
	 * Mutually exclusive with the `CHONKERS_TEST_DB_DIR` env var (the
	 * explicit path wins).
	 */
	readonly path?: string;
}

export interface TestDbHandle {
	/** Drizzle ORM handle, fully typed against `src/persistence/sqlite/schema`. */
	readonly db: BetterSQLite3Database<typeof schema>;
	/** Raw better-sqlite3 connection — for diagnostics + PRAGMA reads. */
	readonly sqlDb: SqlDatabase;
	/** Path the DB was written to (`':memory:'` for the default). */
	readonly path: string;
	/** Number of migrations that were replayed at construction time. */
	readonly migrationsApplied: number;
}

/**
 * Allocate a fresh test database with every committed migration applied.
 * Foreign keys are enabled automatically.
 *
 * @example
 *   // default: in-memory, dies with the connection
 *   const { db } = makeTestDb();
 *
 *   // explicit path: file persists after the test
 *   const { db } = makeTestDb({ path: "/tmp/foo.db" });
 *
 *   // env-driven: each call gets a unique file under the dir
 *   //   CHONKERS_TEST_DB_DIR=/tmp/chonkers pnpm test:node
 */
export function makeTestDb(options: TestDbOptions = {}): TestDbHandle {
	const path = resolvePath(options);
	const sqlDb = new BetterSqlite3(path);
	sqlDb.pragma("foreign_keys = ON");
	const migrationsApplied = applyMigrations(sqlDb);
	const db = drizzle(sqlDb, { schema });
	return { db, sqlDb, path, migrationsApplied };
}

function resolvePath(options: TestDbOptions): string {
	if (options.path) {
		mkdirSync(dirname(options.path), { recursive: true });
		return options.path;
	}
	const envDir = process.env.CHONKERS_TEST_DB_DIR;
	if (envDir) {
		mkdirSync(envDir, { recursive: true });
		const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		return join(envDir, `${id}.db`);
	}
	return ":memory:";
}

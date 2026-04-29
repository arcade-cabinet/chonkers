/**
 * Runtime drizzle-ORM client wired to `@capacitor-community/sqlite`.
 *
 * Uses drizzle's `sqlite-proxy` driver: drizzle calls a single
 * `(sql, params, method) → { rows }` callback, the callback delegates
 * to capacitor-sqlite's `query` (read), `run` (write), or `execute`
 * (DDL / multi-statement). Capacitor's plugin auto-wraps each
 * `execute` and `run` in its own transaction, so drizzle's
 * `db.transaction(fn)` is implemented via the proxy's optional
 * `tx` argument (drizzle keeps multi-statement work on a single
 * batched call to the proxy).
 *
 * Persistence is OPFS-backed on web. After every write we call
 * `sqlite.saveToStore(name)` so the OPFS snapshot stays current —
 * web only; native uses platform SQLite which persists implicitly.
 *
 * Concurrency: a per-DB write-lock queue serialises writers. Reads
 * bypass the queue and run concurrently (better-sqlite3 / capacitor
 * sqlite both serialise their own SQLite handle internally; the
 * extra queue is for *our* save-after-write pattern, which mustn't
 * interleave with another writer's commit).
 *
 * The full bootstrap-and-version-replay flow lives in `bootstrap.ts`.
 * This module is the steady-state runtime client.
 */

import { Capacitor } from "@capacitor/core";
import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

const sqlite = new SQLiteConnection(CapacitorSQLite);
const writeQueues = new Map<string, Promise<unknown>>();

/** Drizzle handle wrapping a capacitor-sqlite SQLiteDBConnection. */
export type ChonkersDb = SqliteRemoteDatabase<typeof schema>;

/**
 * Cached singleton handle. Set by {@link initRuntimeClient} (called
 * by `bootstrap.ts` after the version-replay flow finishes) and read
 * by {@link getDb} thereafter.
 */
let cachedHandle: ChonkersDb | null = null;
let cachedConn: SQLiteDBConnection | null = null;
let cachedName: string | null = null;

/**
 * Wrap a capacitor-sqlite connection with a drizzle proxy driver.
 * After every write, the OPFS store is flushed on web. The wrapped
 * handle is the value `getDb()` returns once initialised.
 */
export function createDrizzleClient(
	name: string,
	conn: SQLiteDBConnection,
): ChonkersDb {
	const flushIfWeb = async (): Promise<void> => {
		if (Capacitor.getPlatform() === "web") {
			await sqlite.saveToStore(name);
		}
	};

	const enqueueWrite = <T>(work: () => Promise<T>): Promise<T> => {
		const prior = writeQueues.get(name) ?? Promise.resolve();
		const next = prior.then(work, work);
		writeQueues.set(
			name,
			next.catch(() => undefined),
		);
		return next;
	};

	return drizzle(
		async (sql, params, method) => {
			// Drizzle's sqlite-proxy supports four methods:
			//   - "run"     — INSERT / UPDATE / DELETE returning lastInsertRowid+changes
			//   - "all"     — SELECT returning every row
			//   - "get"     — SELECT returning one row (we treat as "all" + slice)
			//   - "values"  — SELECT returning row arrays (no column metadata)
			// For chonkers, we only need "run" and "all" — drizzle uses these
			// for every query the repos compose. Other methods fall through
			// to "all" semantics.
			if (method === "run") {
				return enqueueWrite(async () => {
					await conn.run(sql, params as unknown as never);
					await flushIfWeb();
					return { rows: [] };
				});
			}

			const result = await conn.query(sql, params as unknown as never);
			const values = (result.values ?? []) as Record<string, unknown>[];
			const rows = values.map((row) => Object.values(row));
			if (method === "get") {
				return { rows: rows[0] ?? [] };
			}
			return { rows };
		},
		{ schema, casing: "snake_case" },
	);
}

/**
 * Open or retrieve a capacitor-sqlite connection by name. Idempotent
 * across calls — the plugin caches the connection internally.
 */
export async function openConnection(
	name: string,
	version: number,
): Promise<SQLiteDBConnection> {
	await sqlite.checkConnectionsConsistency();
	const existing = await sqlite.isConnection(name, false);
	const conn = existing.result
		? await sqlite.retrieveConnection(name, false)
		: await sqlite.createConnection(
				name,
				false,
				"no-encryption",
				version,
				false,
			);
	await conn.open();
	return conn;
}

/**
 * Close the cached connection (if any) and clear cached state.
 * Subsequent `getDb()` throws until `initRuntimeClient()` runs again.
 * Used by the browser-tier bootstrap test to reset between scenarios.
 */
export async function closeRuntimeClient(): Promise<void> {
	const name = cachedName;
	cachedHandle = null;
	cachedConn = null;
	cachedName = null;
	if (name == null) return;
	writeQueues.delete(name);
	const existing = await sqlite.isConnection(name, false);
	if (existing.result) {
		await sqlite.closeConnection(name, false);
	}
}

/**
 * Set the singleton runtime handle. `bootstrap.ts` calls this after
 * the version-replay flow has settled.
 */
export function setRuntimeClient(
	name: string,
	conn: SQLiteDBConnection,
	handle: ChonkersDb,
): void {
	cachedName = name;
	cachedConn = conn;
	cachedHandle = handle;
}

/**
 * Returns the runtime drizzle handle. Throws if `bootstrap.ts` has
 * not yet completed. Production code routes through `getDbAsync()`
 * via the sim broker; this synchronous accessor exists for hot paths
 * that are contractually after init has run.
 */
export function getDb(): ChonkersDb {
	if (!cachedHandle) {
		throw new Error(
			"getDb: runtime client not initialised — call bootstrap() first",
		);
	}
	return cachedHandle;
}

/**
 * Returns the raw capacitor-sqlite connection. Used internally by
 * `bootstrap.ts` for `PRAGMA user_version` reads and migration replay
 * SQL execution. Repos go through {@link getDb}; only the bootstrap
 * + version-replay paths need the raw connection.
 */
export function getRawConnection(): SQLiteDBConnection {
	if (!cachedConn) {
		throw new Error(
			"getRawConnection: runtime client not initialised — call bootstrap() first",
		);
	}
	return cachedConn;
}

/** Re-export the capacitor-sqlite singleton for `bootstrap.ts` use. */
export { sqlite };

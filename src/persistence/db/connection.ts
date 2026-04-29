/**
 * Database connection lifecycle. Borrowed from mean-streets's
 * src/platform/persistence/database.ts pattern, adapted for chonkers'
 * generic transport (no schema knowledge).
 *
 * On web: registers jeep-sqlite custom element via db/jeep.ts;
 * uses initWebStore for OPFS persistence; flushes via saveToStore
 * after writes.
 *
 * On native: uses platform-native SQLite directly through
 * @capacitor-community/sqlite.
 *
 * Concurrent connections to DIFFERENT names are independent.
 * Connect-then-connect for the same name returns the same cached
 * connection (idempotent).
 */

import { Capacitor } from "@capacitor/core";
import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { registerJeepSqlite } from "./jeep";

const sqlite = new SQLiteConnection(CapacitorSQLite);

const connections = new Map<string, Promise<SQLiteDBConnection>>();
const writeQueues = new Map<string, Promise<unknown>>();

export interface DbConnection {
	exec(sql: string, params?: unknown[]): Promise<void>;
	query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
	transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T>;
}

/** Returns true if a database with the given name has been created. */
export async function exists(name: string): Promise<boolean> {
	if (Capacitor.getPlatform() === "web") {
		await registerJeepSqlite();
	}
	const result = await sqlite.isConnection(name, false);
	return result.result === true;
}

/**
 * Open or create a database. Idempotent — calling twice with the same
 * args returns the same connection. Foreign keys are enabled
 * automatically via PRAGMA on every new connection.
 */
export async function connect(
	name: string,
	version: number,
): Promise<DbConnection> {
	const cached = connections.get(name);
	if (cached) {
		return wrap(name, await cached);
	}

	if (Capacitor.getPlatform() === "web") {
		await registerJeepSqlite();
		await sqlite.initWebStore();
	}

	const promise = (async () => {
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
		await conn.execute("PRAGMA foreign_keys = ON;");
		return conn;
	})();
	connections.set(name, promise);
	const conn = await promise;
	return wrap(name, conn);
}

/** Close a database. Subsequent `connect` reopens it. */
export async function close(name: string): Promise<void> {
	const cached = connections.get(name);
	if (!cached) return;
	connections.delete(name);
	writeQueues.delete(name);
	await cached.then(async () => {
		const existing = await sqlite.isConnection(name, false);
		if (existing.result) {
			await sqlite.closeConnection(name, false);
		}
	});
}

/**
 * Wrap a SQLiteDBConnection with the chonkers DbConnection surface.
 * Writes go through a per-DB queue; reads bypass.
 */
function wrap(name: string, conn: SQLiteDBConnection): DbConnection {
	const ensureQueue = (): Promise<unknown> => {
		const q = writeQueues.get(name);
		if (q) return q;
		const fresh = Promise.resolve();
		writeQueues.set(name, fresh);
		return fresh;
	};

	const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
		const prior = ensureQueue();
		const next = prior.then(
			() => work(),
			() => work(),
		);
		writeQueues.set(name, next);
		return next;
	};

	const flushIfWeb = async (): Promise<void> => {
		if (Capacitor.getPlatform() === "web") {
			await sqlite.saveToStore(name);
		}
	};

	const dbConn: DbConnection = {
		async exec(sql: string, params?: unknown[]): Promise<void> {
			await enqueue(async () => {
				if (params && params.length > 0) {
					await conn.run(sql, params as never);
				} else {
					await conn.execute(sql);
				}
				await flushIfWeb();
			});
		},

		async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
			const result = await conn.query(sql, params as never);
			return (result.values ?? []) as T[];
		},

		async transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T> {
			return enqueue(async () => {
				await conn.execute("BEGIN");
				try {
					const result = await fn(dbConn);
					await conn.execute("COMMIT");
					await flushIfWeb();
					return result;
				} catch (err) {
					try {
						await conn.execute("ROLLBACK");
					} catch {
						// Best-effort rollback; surface the original error below.
					}
					throw err;
				}
			});
		},
	};

	return dbConn;
}

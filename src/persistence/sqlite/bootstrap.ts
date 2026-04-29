/**
 * Runtime bootstrap: get the user's chonkers SQLite database into a
 * working state, regardless of which run this is.
 *
 *   First run:           import `public/game.db` into OPFS.
 *   Subsequent run:      open persisted DB, check `PRAGMA user_version`
 *                        against the served meta. No-op if equal,
 *                        replay forward if served > persisted, refuse
 *                        if served < persisted.
 *
 * The runtime never executes `CREATE TABLE` directly — every schema
 * mutation comes from a committed `drizzle/NNNN_*.sql` file replayed
 * inside an outer transaction so a failure rolls back rather than
 * leaving the persisted DB half-migrated.
 *
 * See `docs/DB.md` "User runtime" for the contract this implements.
 */

import { Capacitor } from "@capacitor/core";
import {
	type ChonkersDb,
	createDrizzleClient,
	openConnection,
	setRuntimeClient,
	sqlite,
} from "./client";
import { registerJeepSqlite } from "./jeep-web";
import { computeReplay, fetchServedMeta, type ServedDbMeta } from "./version";

const DB_NAME = "chonkers";

export interface BootstrapOptions {
	/**
	 * Override the served meta JSON URL. Defaults to
	 * `${BASE_URL}game-db.meta.json` (Vite's BASE_URL is honoured by
	 * `fetchServedMeta`'s default resolver).
	 *
	 * The shipped database file URL is NOT separately configurable —
	 * capacitor-sqlite's `copyFromAssets()` auto-discovers the file via
	 * the `databases.json` manifest at the platform-standard asset path,
	 * which `scripts/build-game-db.mjs` writes to
	 * `public/assets/databases/`.
	 */
	readonly metaUrl?: string;
	/**
	 * Source for the `drizzle/NNNN_*.sql` migration ladder. The runtime
	 * needs the SQL for migrations *after* the shipped DB's version.
	 * Vite resolves `import.meta.glob('../../../drizzle/*.sql', ..., { eager: true })`
	 * at build time; the test harness can pass a precomputed map.
	 */
	readonly migrationSql?: ReadonlyMap<number, string>;
}

export interface BootstrapResult {
	readonly db: ChonkersDb;
	readonly version: number;
	readonly served: ServedDbMeta;
	/** What the bootstrap actually did, for diagnostics + telemetry. */
	readonly outcome: "imported-fresh" | "no-op" | "replayed-forward";
}

class DowngradeRefusedError extends Error {
	constructor(
		readonly persistedVersion: number,
		readonly servedVersion: number,
	) {
		super(
			`bootstrap: persisted DB version ${persistedVersion} is newer than served bundle version ${servedVersion}; refusing to downgrade`,
		);
		this.name = "DowngradeRefusedError";
	}
}

export { DowngradeRefusedError };

/**
 * Read `PRAGMA user_version` from the named DB if it exists. Returns
 * null when the DB has not been created on this device.
 */
async function readPersistedVersion(name: string): Promise<number | null> {
	const exists = (await sqlite.isDatabase(name)).result;
	if (!exists) return null;
	const conn = await openConnection(name, 0);
	const res = await conn.query("PRAGMA user_version");
	const rows = (res.values ?? []) as Array<{ user_version: number }>;
	return rows[0]?.user_version ?? 0;
}

/**
 * Import the shipped chonkers SQLite asset via capacitor-sqlite's
 * `copyFromAssets`. The build script (`scripts/build-game-db.mjs`)
 * places the file at `public/assets/databases/chonkersSQLite.db` and
 * the discovery manifest at `public/assets/databases/databases.json`,
 * which capacitor-sqlite + jeep-sqlite auto-discover.
 *
 * Same code path on web and native:
 *   - Web: jeep-sqlite reads `/assets/databases/databases.json` over
 *     HTTP and saves each listed file into IndexedDB under the
 *     `<name>SQLite.db` key.
 *   - Native: capacitor-sqlite reads from the platform asset dir
 *     (populated by `cap sync` from `public/assets/databases/`) and
 *     copies the file into the SQLite store.
 *
 * The shipped DB already has `PRAGMA user_version` set by the build
 * script, so no additional version stamping is needed after import.
 */
async function importFreshAsset(): Promise<void> {
	await sqlite.copyFromAssets(true);
}

/**
 * Replay migration SQL files for the indices in the replay window
 * against the persisted DB. capacitor-sqlite's `executeSet` batches
 * every statement in a single transaction; on any statement failure,
 * the entire batch rolls back and the persisted DB stays at its
 * pre-replay version.
 *
 * NB: capacitor-sqlite's `execute()` auto-wraps each call in its own
 * transaction, so explicit BEGIN/COMMIT statements outside `executeSet`
 * collide with that wrapping. `executeSet` is the documented path for
 * "many statements, one transaction".
 */
async function replayForward(
	name: string,
	migrationIndices: readonly number[],
	migrationSql: ReadonlyMap<number, string>,
	targetVersion: number,
): Promise<void> {
	const conn = await openConnection(name, targetVersion);
	const statements: { statement: string; values: unknown[] }[] = [];
	for (const idx of migrationIndices) {
		const file = migrationSql.get(idx);
		if (file == null) {
			throw new Error(
				`replayForward: missing SQL for migration index ${idx} — is the migrationSql map populated?`,
			);
		}
		// drizzle-kit emits `--> statement-breakpoint` between statements.
		const parts = file
			.split(/--> statement-breakpoint/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		for (const stmt of parts) statements.push({ statement: stmt, values: [] });
	}
	// Apply migrations atomically inside one transaction.
	await conn.executeSet(statements, true);
	// Bump PRAGMA user_version OUTSIDE a transaction. capacitor-sqlite's
	// `executeSet` with `transaction: false` runs each statement directly
	// without a wrapping BEGIN/COMMIT — required for PRAGMAs that mutate
	// connection-level state. Wrapping the PRAGMA in a transaction (the
	// default `executeSet` behaviour) makes the PRAGMA's effect visible
	// only inside that transaction and reverts it on commit.
	await conn.executeSet(
		[{ statement: `PRAGMA user_version = ${targetVersion}`, values: [] }],
		false,
	);
	// Persist the user_version write (and the migration's CREATE TABLE rows)
	// to OPFS-backed IndexedDB. Without this, the next bootstrap() opens
	// the pre-replay snapshot and the version-bump appears reverted.
	if (Capacitor.getPlatform() === "web") {
		await sqlite.saveToStore(name);
	}
}

/**
 * Default migration source resolved at build time. Vite's
 * `import.meta.glob` reads `drizzle/*.sql` and inlines the contents
 * as a module. Tests can pass a synthetic map via
 * {@link BootstrapOptions.migrationSql}.
 */
function defaultMigrationSql(): ReadonlyMap<number, string> {
	// Resolved relative to this file: src/persistence/sqlite/bootstrap.ts → ../../../drizzle/
	const modules = import.meta.glob("../../../drizzle/*.sql", {
		query: "?raw",
		import: "default",
		eager: true,
	}) as Record<string, string>;
	const entries = Object.entries(modules)
		.map(([path, sql]) => {
			const match = path.match(/(\d{4})_/);
			if (!match) return null;
			const idx = Number.parseInt(match[1] ?? "", 10);
			return [idx, sql] as const;
		})
		.filter((e): e is readonly [number, string] => e != null)
		.sort((a, b) => a[0] - b[0]);
	return new Map(entries);
}

/**
 * Run the bootstrap flow. Idempotent — calling twice on the same
 * device performs the version check both times; the second call is
 * a `no-op` outcome.
 *
 * After this resolves, `getDb()` and `getRawConnection()` are usable
 * from anywhere in `src/`.
 */
export async function bootstrap(
	options: BootstrapOptions = {},
): Promise<BootstrapResult> {
	const migrationSql = options.migrationSql ?? defaultMigrationSql();

	if (Capacitor.getPlatform() === "web") {
		await registerJeepSqlite();
		await sqlite.initWebStore();
	}

	const served = options.metaUrl
		? await fetchServedMeta(options.metaUrl)
		: await fetchServedMeta();
	const persistedVersion = await readPersistedVersion(DB_NAME);
	const decision = computeReplay(persistedVersion, served.user_version);

	let outcome: BootstrapResult["outcome"];
	switch (decision.kind) {
		case "import-fresh":
			await importFreshAsset();
			outcome = "imported-fresh";
			break;
		case "no-op":
			outcome = "no-op";
			break;
		case "replay-forward":
			await replayForward(
				DB_NAME,
				decision.migrationIndices,
				migrationSql,
				decision.servedVersion,
			);
			outcome = "replayed-forward";
			break;
		case "refuse-downgrade":
			throw new DowngradeRefusedError(
				decision.persistedVersion,
				decision.servedVersion,
			);
	}

	const conn = await openConnection(DB_NAME, served.user_version);
	const handle = createDrizzleClient(DB_NAME, conn);
	setRuntimeClient(DB_NAME, conn, handle);

	return {
		db: handle,
		version: served.user_version,
		served,
		outcome,
	};
}

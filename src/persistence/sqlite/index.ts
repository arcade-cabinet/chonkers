/**
 * src/persistence/sqlite — drizzle ORM + @capacitor-community/sqlite.
 *
 * Build-time pipeline materialises `public/game.db` from drizzle-kit
 * migrations; runtime adapter imports the asset and replays missing
 * migrations forward against persisted user copies. Test-tier uses
 * an ad-hoc `better-sqlite3` instance via `makeTestDb()`.
 *
 * See `docs/DB.md` for the full architecture, the test-tier strategy,
 * and the table catalogue.
 */

export {
	type BootstrapOptions,
	type BootstrapResult,
	bootstrap,
	DowngradeRefusedError,
} from "./bootstrap";
export {
	type ChonkersDb,
	closeRuntimeClient,
	getDb,
	getRawConnection,
} from "./client";
export * from "./schema";
export {
	computeReplay,
	fetchServedMeta,
	type ReplayDecision,
	type ServedDbMeta,
} from "./version";

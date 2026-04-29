/**
 * Browser-tier bootstrap smoke test.
 *
 * Per `docs/TESTING.md` Tier 2: this test covers ONLY the runtime
 * adapter's bootstrap path against real `@capacitor-community/sqlite`
 * and real OPFS persistence. CRUD, schema correctness, transaction
 * semantics — those all live in the Node tier (`schema.test.ts`,
 * `version.test.ts`, repo tests).
 *
 * Three scenarios cover the bootstrap state machine:
 *   1. import-fresh — no persisted DB; fetches `public/game.db` and
 *      imports it into OPFS, leaving `PRAGMA user_version = served`.
 *   2. no-op       — persisted DB at the same version as the served
 *      bundle; bootstrap returns immediately.
 *   3. replay-forward — persisted DB at version N; served meta
 *      claims version N+1; bootstrap replays the new migration SQL
 *      and bumps `PRAGMA user_version`.
 *
 * The downgrade-refused path is covered indirectly: the `version.test.ts`
 * Node tier exhaustively tests `computeReplay`, and bootstrap simply
 * routes that decision into a thrown `DowngradeRefusedError`.
 */

import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	bootstrap,
	closeRuntimeClient,
	getRawConnection,
} from "@/persistence/sqlite";
// Internal import to bypass the public barrel — `registerJeepSqlite` is the
// SAME helper bootstrap uses internally; we call it once up front to ensure
// the custom element is in the DOM before our cleanup helpers touch
// capacitor-sqlite (which would otherwise throw "jeep-sqlite element not
// present" when called before the first bootstrap).
import { registerJeepSqlite } from "../jeep-web";

const sqlite = new SQLiteConnection(CapacitorSQLite);
const DB_NAME = "chonkers";

/**
 * Tear down any persisted OPFS state for the chonkers DB. capacitor-sqlite's
 * `delete()` on an open connection removes both the connection state and
 * the OPFS file.
 */
async function clearChonkersOpfs(): Promise<void> {
	await closeRuntimeClient();
	const exists = (await sqlite.isDatabase(DB_NAME)).result;
	if (!exists) return;
	const conn = (await sqlite.isConnection(DB_NAME, false)).result
		? await sqlite.retrieveConnection(DB_NAME, false)
		: await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
	await conn.open();
	await conn.delete();
	const stillConnected = (await sqlite.isConnection(DB_NAME, false)).result;
	if (stillConnected) await sqlite.closeConnection(DB_NAME, false);
}

beforeAll(async () => {
	if (Capacitor.getPlatform() === "web") {
		await registerJeepSqlite();
		await sqlite.initWebStore();
	}
});

beforeEach(async () => {
	await clearChonkersOpfs();
});

afterEach(async () => {
	await clearChonkersOpfs();
});

describe("bootstrap", () => {
	it("imports `public/game.db` on first run", async () => {
		const result = await bootstrap();
		expect(result.outcome).toBe("imported-fresh");
		expect(result.version).toBeGreaterThanOrEqual(1);

		const conn = getRawConnection();
		const userVersionRows =
			(await conn.query("PRAGMA user_version")).values ?? [];
		const persisted = (
			userVersionRows[0] as { user_version: number } | undefined
		)?.user_version;
		expect(persisted).toBe(result.version);

		// Tables from drizzle/0000_initial.sql must be present.
		const tablesRes =
			(
				await conn.query(
					"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
				)
			).values ?? [];
		const tableNames = (tablesRes as Array<{ name: string }>)
			.map((r) => r.name)
			.filter((n) => !n.startsWith("sqlite_"));
		expect(tableNames).toEqual(
			expect.arrayContaining([
				"ai_states",
				"analytics_aggregates",
				"matches",
				"moves",
			]),
		);
	}, 30000);

	it("is a no-op on second run when versions match", async () => {
		const first = await bootstrap();
		expect(first.outcome).toBe("imported-fresh");
		await closeRuntimeClient();

		const second = await bootstrap();
		expect(second.outcome).toBe("no-op");
		expect(second.version).toBe(first.version);
	}, 30000);

	it("replays missing migrations forward when served > persisted", async () => {
		// First, import-fresh the shipped DB (version N).
		const first = await bootstrap();
		const baseVersion = first.version;
		await closeRuntimeClient();

		// Build a synthetic future migration that adds a smoke table, plus
		// a meta JSON declaring version N+1. Bootstrap should detect the
		// drift and replay the migration against the persisted OPFS DB.
		const futureMigration = `
			CREATE TABLE smoke_replay_marker (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				note TEXT NOT NULL
			);
			--> statement-breakpoint
			INSERT INTO smoke_replay_marker (note) VALUES ('replay-${baseVersion}-to-${baseVersion + 1}');
		`;
		const migrationSql = new Map<number, string>([
			[baseVersion, futureMigration],
		]);

		const futureMeta = {
			user_version: baseVersion + 1,
			generated_at: new Date().toISOString(),
		};
		const metaUrl = URL.createObjectURL(
			new Blob([JSON.stringify(futureMeta)], {
				type: "application/json",
			}),
		);

		try {
			const second = await bootstrap({ metaUrl, migrationSql });
			expect(second.outcome).toBe("replayed-forward");
			expect(second.version).toBe(baseVersion + 1);

			const conn = getRawConnection();
			const versionRows =
				(await conn.query("PRAGMA user_version")).values ?? [];
			expect(
				(versionRows[0] as { user_version: number } | undefined)?.user_version,
			).toBe(baseVersion + 1);

			// The replayed migration's row landed.
			const markerRows =
				(await conn.query("SELECT note FROM smoke_replay_marker")).values ?? [];
			expect(markerRows.length).toBe(1);
			expect((markerRows[0] as { note: string } | undefined)?.note).toBe(
				`replay-${baseVersion}-to-${baseVersion + 1}`,
			);
		} finally {
			URL.revokeObjectURL(metaUrl);
		}
	}, 60000);
});

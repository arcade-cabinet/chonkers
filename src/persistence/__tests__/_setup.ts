/**
 * Browser-tier test setup for src/persistence.
 *
 * Each test that needs a database calls `useIsolatedDb()` from a
 * `beforeEach` hook. The helper allocates a unique DB name + version,
 * registers an `afterEach` to close + drop the connection, and
 * returns the `(name, version)` pair for the test to pass into
 * `db.connect`.
 *
 * Side-effect import: just `import './_setup';` at the top of a
 * test file registers the jeep-sqlite custom element exactly once
 * per test session (web platform only — native platforms ignore
 * the registration). The registration is idempotent across test
 * files; only the first import does work.
 *
 * Lifecycle:
 *   1. First test imports './_setup' → custom element registers.
 *   2. Per test: `beforeEach(() => useIsolatedDb())` → unique name,
 *      registered for cleanup.
 *   3. After test: `afterEach` (registered by useIsolatedDb) closes
 *      the connection.
 *   4. Session teardown: `afterAll` at module scope iterates any
 *      leaked names and force-closes them.
 */

import { Capacitor } from "@capacitor/core";
import { defineCustomElements as defineJeepSqlite } from "jeep-sqlite/loader";
import { afterAll, afterEach } from "vitest";
import { db } from "@/persistence";

let jeepRegistered = false;
const allAllocated = new Set<string>();

/**
 * Register the `jeep-sqlite` custom element once per session.
 * No-op on native platforms (Capacitor handles SQLite directly).
 * No-op on subsequent calls within the same session.
 */
async function ensureJeepRegistered(): Promise<void> {
	if (jeepRegistered) return;
	if (Capacitor.getPlatform() !== "web") {
		jeepRegistered = true;
		return;
	}

	defineJeepSqlite(window);
	await customElements.whenDefined("jeep-sqlite");

	if (!document.querySelector("jeep-sqlite")) {
		const el = document.createElement("jeep-sqlite");
		el.setAttribute("autosave", "true");
		document.body.appendChild(el);
	}

	jeepRegistered = true;
}

/**
 * Allocate a unique test database. Registers an afterEach hook
 * that closes the connection. Returns the (name, version) pair
 * the test passes into `db.connect`.
 *
 * Usage:
 *
 *   let dbName: string;
 *   beforeEach(async () => {
 *     ({ name: dbName } = await useIsolatedDb());
 *   });
 *   it('does a thing', async () => {
 *     const conn = await db.connect(dbName, 1);
 *     // ...
 *   });
 */
export async function useIsolatedDb(): Promise<{
	readonly name: string;
	readonly version: number;
}> {
	await ensureJeepRegistered();

	const name = `chonkers-test-${crypto.randomUUID()}`;
	const version = 1;
	allAllocated.add(name);

	afterEach(async () => {
		try {
			await db.close(name);
		} catch {
			// Already closed or never opened — fine.
		}
		allAllocated.delete(name);
	});

	return { name, version };
}

/**
 * Session-level cleanup: force-close any DB names this module
 * allocated but didn't see closed. Catches leaked DBs from tests
 * that crashed or skipped their afterEach.
 */
afterAll(async () => {
	const leaked = Array.from(allAllocated);
	allAllocated.clear();
	await Promise.all(
		leaked.map((name) =>
			db.close(name).catch(() => {
				// Best-effort cleanup.
			}),
		),
	);
});

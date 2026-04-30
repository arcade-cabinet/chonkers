/**
 * Browser-tier setup for src/audio tests.
 *
 * Each test runs against a fresh `audioBus` singleton + an empty
 * `kv` namespace `'settings'`. The singleton lives at module scope
 * inside `audioBus.ts`, so we tear it down via the test-only export
 * `__resetBusForTest()` and clear the kv namespace via
 * `Preferences.clear()` (kv encodes namespace + key into the
 * Preferences key-space, so clearing all of Preferences is the
 * coarsest-but-correct reset).
 */

import { Preferences } from "@capacitor/preferences";
import { Howler } from "howler";
import { afterEach, beforeEach } from "vitest";
import { __resetBusForTest } from "../audioBus";

beforeEach(async () => {
	await Preferences.clear();
	await __resetBusForTest();
	// Best-effort: kick the global Web Audio context if the platform
	// suspended it. Bounded — `resume()` can hang in some headless
	// environments and we don't want it to deadlock the hook.
	const ctx = Howler.ctx;
	if (ctx && ctx.state === "suspended") {
		await Promise.race([
			ctx.resume().catch(() => {}),
			new Promise<void>((r) => setTimeout(r, 500)),
		]);
	}
});

afterEach(async () => {
	await __resetBusForTest();
	await Preferences.clear();
});

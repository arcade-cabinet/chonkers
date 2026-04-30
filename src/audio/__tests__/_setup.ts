/**
 * Browser-tier setup for src/audio tests.
 *
 * Each test runs against a fresh `audioBus` singleton + an empty
 * `kv` namespace `'settings'`. The singleton's bounded
 * `Howler.ctx.resume()` happens inside `init()`, so this setup file
 * does NOT need to resume the context separately.
 */

import { Preferences } from "@capacitor/preferences";
import { afterEach, beforeEach } from "vitest";
import { __resetBusForTest } from "../audioBus";

beforeEach(async () => {
	await Preferences.clear();
	await __resetBusForTest();
});

afterEach(async () => {
	await __resetBusForTest();
	await Preferences.clear();
});

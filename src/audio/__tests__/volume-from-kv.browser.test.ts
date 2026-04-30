/**
 * Tier 2 (browser) tests for the kv ↔ audioBus contract.
 *
 * On `init`, the bus reads volume + muted from `kv` namespace
 * `'settings'`. Defaults are 0.7 (volume) + false (muted) when no
 * value is present. After a `setVolume`/`setMuted` call, the next
 * fresh init should read the updated value.
 */

import { describe, expect, it } from "vitest";
import { kv } from "@/persistence/preferences";
import { __resetBusForTest, getAudioBus } from "../audioBus";

import "./_setup";

describe("audioBus — kv-backed volume + mute", () => {
	it("defaults to volume=0.7 and muted=false when kv is empty", async () => {
		const bus = await getAudioBus();
		expect(bus.getVolume()).toBe(0.7);
		expect(bus.getMuted()).toBe(false);
	});

	it("reads volume from kv on init when previously persisted", async () => {
		await kv.put("settings", "volume", 0.31);
		const bus = await getAudioBus();
		expect(bus.getVolume()).toBe(0.31);
	});

	it("reads muted from kv on init when previously persisted", async () => {
		await kv.put("settings", "muted", true);
		const bus = await getAudioBus();
		expect(bus.getMuted()).toBe(true);
	});

	it("setVolume → reset → re-init round-trips through kv", async () => {
		const a = await getAudioBus();
		await a.setVolume(0.42);
		await __resetBusForTest();
		const b = await getAudioBus();
		expect(b.getVolume()).toBe(0.42);
	});

	it("setMuted → reset → re-init round-trips through kv", async () => {
		const a = await getAudioBus();
		await a.setMuted(true);
		await __resetBusForTest();
		const b = await getAudioBus();
		expect(b.getMuted()).toBe(true);
	});

	it("rejects NaN / Infinity / out-of-range volumes from kv (defends Howl.volume)", async () => {
		// All three pass the `typeof === "number"` guard but are
		// invalid Howl volumes. The init path must defend against
		// tampered or older-client localStorage values.
		await kv.put("settings", "volume", Number.NaN);
		const a = await getAudioBus();
		expect(a.getVolume()).toBe(0.7);
		await __resetBusForTest();

		await kv.put("settings", "volume", Number.POSITIVE_INFINITY);
		const b = await getAudioBus();
		expect(b.getVolume()).toBe(0.7);
		await __resetBusForTest();

		await kv.put("settings", "volume", 2.5);
		const c = await getAudioBus();
		expect(c.getVolume()).toBe(1); // clamped to upper bound
	});
});

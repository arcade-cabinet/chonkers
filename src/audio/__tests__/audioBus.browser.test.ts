/**
 * Tier 2 (browser) tests for the Howler-backed audio bus.
 *
 * Real Howler instances; no mocks. Tests assert bus contract through
 * internal state introspection — Howler's own `.playing()` /
 * `.volume()` are environment-dependent in headless test runs (the
 * Web Audio context doesn't actually drive a speaker), so the bus
 * exposes `getActiveDucks()` and `getAmbientRequested()` as the
 * authoritative observable state.
 */

import { describe, expect, it } from "vitest";
import { kv } from "@/persistence/preferences";
import { type AudioRole, getAudioBus } from "../audioBus";

import "./_setup";

const ALL_ROLES: ReadonlyArray<AudioRole> = [
	"ambient",
	"move",
	"chonk",
	"split",
	"sting",
	"win",
	"lose",
];

describe("audioBus — lazy async singleton", () => {
	it("resolves with all seven Howls registered", async () => {
		const bus = await getAudioBus();
		for (const role of ALL_ROLES) {
			expect(bus.has(role)).toBe(true);
		}
	});

	it("returns the SAME promise on a second call (no double-init)", async () => {
		const a = getAudioBus();
		const b = getAudioBus();
		expect(a).toBe(b);
		const [busA, busB] = await Promise.all([a, b]);
		expect(busA).toBe(busB);
	});

	it("setVolume clamps to [0, 1] and persists via kv", async () => {
		const bus = await getAudioBus();
		await bus.setVolume(1.5);
		expect(bus.getVolume()).toBe(1);
		await bus.setVolume(-0.4);
		expect(bus.getVolume()).toBe(0);
		await bus.setVolume(0.42);
		expect(bus.getVolume()).toBe(0.42);
		expect(await kv.get<number>("settings", "volume")).toBe(0.42);
	});

	it("setMuted persists via kv", async () => {
		const bus = await getAudioBus();
		await bus.setMuted(true);
		expect(bus.getMuted()).toBe(true);
		expect(await kv.get<boolean>("settings", "muted")).toBe(true);
	});

	it("play() is a no-op while muted (no duck triggered)", async () => {
		const bus = await getAudioBus();
		await bus.setMuted(true);
		bus.play("sting");
		expect(bus.getActiveDucks()).toBe(0);
	});

	it("startAmbient + stopAmbient toggle the ambient-requested flag", async () => {
		const bus = await getAudioBus();
		expect(bus.getAmbientRequested()).toBe(false);
		bus.startAmbient();
		expect(bus.getAmbientRequested()).toBe(true);
		bus.stopAmbient();
		expect(bus.getAmbientRequested()).toBe(false);
	});

	it("startAmbient is a no-op while muted", async () => {
		const bus = await getAudioBus();
		await bus.setMuted(true);
		bus.startAmbient();
		expect(bus.getAmbientRequested()).toBe(false);
	});
});

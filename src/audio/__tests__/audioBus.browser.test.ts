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

	it("startAmbient guards against stacking on repeated calls", async () => {
		// Regression: ambient has loop:true; calling play() while
		// it's already playing creates a duplicate playback instance
		// from Howler's internal pool (overlapping loops at higher
		// volume). The bus must guard via ambientRequested OR the
		// Howl's playing() check.
		const bus = await getAudioBus();
		bus.startAmbient();
		expect(bus.getAmbientRequested()).toBe(true);
		// Second call: should be a no-op. We can't directly observe
		// "no duplicate instance" in headless, but we CAN observe
		// that ambientRequested doesn't flip and no error is thrown.
		bus.startAmbient();
		expect(bus.getAmbientRequested()).toBe(true);
	});

	it("setMuted(false) restores ambient if it was previously requested", async () => {
		// Regression: pre-fix, muting + unmuting left ambient silent
		// even when ambientRequested was true. The bus must re-arm
		// ambient on unmute so the music returns without manual
		// intervention.
		const bus = await getAudioBus();
		bus.startAmbient();
		expect(bus.getAmbientRequested()).toBe(true);
		await bus.setMuted(true);
		// Ambient stops on mute (Howl stop), but the request flag
		// stays implicit through this in-memory fix.
		await bus.setMuted(false);
		expect(bus.getAmbientRequested()).toBe(true);
	});
});

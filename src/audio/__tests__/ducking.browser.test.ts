/**
 * Tier 2 (browser) tests for the duck-counter contract.
 *
 * Asserts that `play()` on a sting role increments `activeDucks` and
 * the matching `end` event (or `stop()`) decrements it; that
 * overlapping stings stack correctly without over-quieting; and that
 * setMuted resets the counter.
 *
 * The actual ambient-volume fade is a Howler-internal concern — we
 * trust Howler's `.fade()` API to behave per docs and assert only
 * the counter that DRIVES the duck/restore decision. The headless
 * test environment doesn't run Web Audio through to a speaker
 * deterministically, so observing `.volume()` post-fade is flaky
 * even with --autoplay-policy unlocked.
 */

import { describe, expect, it } from "vitest";
import { getAudioBus } from "../audioBus";

import "./_setup";

describe("audioBus — duck-counter stacking", () => {
	it("a single sting increments then decrements activeDucks via stop()", async () => {
		const bus = await getAudioBus();
		bus.startAmbient();
		bus.play("sting");
		expect(bus.getActiveDucks()).toBe(1);
		bus.stop("sting");
		expect(bus.getActiveDucks()).toBe(0);
	});

	it("two overlapping stings stack to 2 ducks; ending one keeps duck active", async () => {
		const bus = await getAudioBus();
		bus.startAmbient();
		bus.play("sting");
		bus.play("win");
		expect(bus.getActiveDucks()).toBe(2);
		bus.stop("sting");
		expect(bus.getActiveDucks()).toBe(1);
		bus.stop("win");
		expect(bus.getActiveDucks()).toBe(0);
	});

	it("non-sting roles do not duck", async () => {
		const bus = await getAudioBus();
		bus.startAmbient();
		bus.play("chonk");
		bus.play("move");
		bus.play("split");
		expect(bus.getActiveDucks()).toBe(0);
	});

	it("setMuted(true) zeroes the duck counter even mid-sting", async () => {
		const bus = await getAudioBus();
		bus.startAmbient();
		bus.play("sting");
		bus.play("lose");
		expect(bus.getActiveDucks()).toBe(2);
		await bus.setMuted(true);
		expect(bus.getActiveDucks()).toBe(0);
	});

	it("stop(role) on a doubly-played sting clears all instances of that role", async () => {
		// Regression: the original implementation called sound.stop()
		// without a playback id, cancelling all instances + their
		// 'end' handlers but only decrementing the counter once.
		// Two stings → stop('sting') once → counter must hit 0,
		// not stay at 1, so ambient can restore.
		const bus = await getAudioBus();
		bus.startAmbient();
		bus.play("sting");
		bus.play("sting");
		expect(bus.getActiveDucks()).toBe(2);
		bus.stop("sting");
		expect(bus.getActiveDucks()).toBe(0);
	});
});

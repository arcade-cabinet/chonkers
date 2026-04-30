import { describe, expect, it } from "vitest";
import {
	ALL_PROFILE_KEYS,
	getProfile,
	isProfileKey,
	PROFILES,
} from "../profiles";

describe("profiles", () => {
	it("declares exactly 9 profile keys", () => {
		expect(ALL_PROFILE_KEYS).toHaveLength(9);
	});

	it("every profile key resolves to a profile", () => {
		for (const key of ALL_PROFILE_KEYS) {
			const p = getProfile(key);
			expect(p.key).toBe(key);
			expect(p.weights).toBeDefined();
			expect(p.knobs).toBeDefined();
			expect(p.forfeit).toBeDefined();
		}
	});

	it("isProfileKey accepts every catalogued key", () => {
		for (const key of ALL_PROFILE_KEYS) {
			expect(isProfileKey(key)).toBe(true);
		}
	});

	it("isProfileKey rejects unknown strings", () => {
		expect(isProfileKey("unknown")).toBe(false);
		expect(isProfileKey("")).toBe(false);
		expect(isProfileKey("aggressive-x")).toBe(false);
	});

	it("aggressive profiles weight forward_progress higher than defensive", () => {
		expect(
			PROFILES["aggressive-medium"].weights.forward_progress,
		).toBeGreaterThan(PROFILES["defensive-medium"].weights.forward_progress);
	});

	it("defensive profiles weight blocker_count higher than aggressive", () => {
		expect(PROFILES["defensive-medium"].weights.blocker_count).toBeGreaterThan(
			PROFILES["aggressive-medium"].weights.blocker_count,
		);
	});

	it("hard difficulty has the deepest search and longest budget", () => {
		expect(PROFILES["balanced-hard"].knobs.search_depth).toBeGreaterThan(
			PROFILES["balanced-medium"].knobs.search_depth,
		);
		expect(PROFILES["balanced-hard"].knobs.time_budget_ms).toBeGreaterThan(
			PROFILES["balanced-medium"].knobs.time_budget_ms,
		);
	});

	it("forfeit thresholds are ordered: aggressive < balanced < defensive (by leniency to give up)", () => {
		// Defensive forfeits earliest = highest threshold = least negative.
		expect(PROFILES["defensive-medium"].forfeit.threshold).toBeGreaterThan(
			PROFILES["balanced-medium"].forfeit.threshold,
		);
		expect(PROFILES["balanced-medium"].forfeit.threshold).toBeGreaterThan(
			PROFILES["aggressive-medium"].forfeit.threshold,
		);
	});

	it("disposition determines weight ratios; difficulty determines knobs", () => {
		// Two profiles with same disposition share the same weights.
		expect(PROFILES["aggressive-easy"].weights).toEqual(
			PROFILES["aggressive-medium"].weights,
		);
		// Two profiles with same difficulty share the same knobs.
		expect(PROFILES["aggressive-medium"].knobs).toEqual(
			PROFILES["balanced-medium"].knobs,
		);
	});
});

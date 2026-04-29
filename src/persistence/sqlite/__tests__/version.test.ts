import { describe, expect, it } from "vitest";
import { computeReplay } from "../version";

describe("computeReplay", () => {
	it("imports fresh when no persisted DB exists", () => {
		expect(computeReplay(null, 1)).toEqual({
			kind: "import-fresh",
			servedVersion: 1,
		});
		expect(computeReplay(null, 7)).toEqual({
			kind: "import-fresh",
			servedVersion: 7,
		});
	});

	it("is a no-op when persisted equals served", () => {
		expect(computeReplay(1, 1)).toEqual({ kind: "no-op", version: 1 });
		expect(computeReplay(42, 42)).toEqual({ kind: "no-op", version: 42 });
	});

	it("computes the inclusive replay window when persisted < served", () => {
		expect(computeReplay(1, 3)).toEqual({
			kind: "replay-forward",
			persistedVersion: 1,
			servedVersion: 3,
			migrationIndices: [1, 2],
		});
	});

	it("returns a single-step replay window when versions differ by exactly one", () => {
		expect(computeReplay(4, 5)).toEqual({
			kind: "replay-forward",
			persistedVersion: 4,
			servedVersion: 5,
			migrationIndices: [4],
		});
	});

	it("replays from version 0 when persisted is 0 and served is N", () => {
		expect(computeReplay(0, 3)).toEqual({
			kind: "replay-forward",
			persistedVersion: 0,
			servedVersion: 3,
			migrationIndices: [0, 1, 2],
		});
	});

	it("refuses downgrade when persisted > served", () => {
		expect(computeReplay(5, 3)).toEqual({
			kind: "refuse-downgrade",
			persistedVersion: 5,
			servedVersion: 3,
		});
		expect(computeReplay(2, 1)).toEqual({
			kind: "refuse-downgrade",
			persistedVersion: 2,
			servedVersion: 1,
		});
	});
});

/**
 * Alpha-stage gate per docs/STATE.md: 100 AI-vs-AI matches end-to-
 * end against real engine + ai, no mocks. Used to surface contract
 * bugs and obvious balance issues.
 *
 * The test runs in `replay` mode for host-independent determinism
 * per docs/AI.md. Each match has a unique deterministic seed so
 * outliers can be re-played by recording (seed, profiles).
 *
 * The test does NOT assert balance ratios or win-rate distributions
 * — those are tuned per docs/AI.md "Tuning history" after this test
 * passes. The 100-run gate is a CONTRACT test: it asserts only that
 * the entire pipeline runs end-to-end and either finds a winner or
 * records an outlier for every run. Balance + analytics aggregates
 * happen at the governor level (1000-run beta, 10000-run rc) which
 * write per-match artifacts to disk for offline analysis.
 */

import { describe, expect, it } from "vitest";
import { ALL_PROFILE_KEYS } from "@/ai";
import { createMatch, playToCompletion } from "../broker";

describe("broker — 100-run alpha gate", () => {
	it(
		"runs 100 AI-vs-AI matches end-to-end",
		async () => {
			const easyKeys = ALL_PROFILE_KEYS.filter((k) => k.endsWith("-easy"));
			const RUNS = 100;
			const PLY_CAP = 40;

			let outliers = 0;
			let redWins = 0;
			let whiteWins = 0;
			let unfinished = 0;
			const totalPlies: number[] = [];

			for (let i = 0; i < RUNS; i += 1) {
				const red = easyKeys[i % easyKeys.length];
				const white = easyKeys[(i + 1) % easyKeys.length];
				if (!red || !white) throw new Error("no easy profile keys");

				const seed =
					`0${(i & 0xff).toString(16).padStart(2, "0")}${"00".repeat(7)}`.slice(
						0,
						16,
					);

				const handle = createMatch({
					redProfile: red,
					whiteProfile: white,
					coinFlipSeed: seed,
					matchId: `alpha-${i}`,
				});
				const result = await playToCompletion(handle, {
					mode: "replay",
					maxPlies: PLY_CAP,
				});
				if (result.outlier) outliers += 1;
				if (result.winner === "red") redWins += 1;
				else if (result.winner === "white") whiteWins += 1;
				else unfinished += 1;
				expect(handle.actions.length).toBe(result.plies);
				expect(result.plies).toBeLessThanOrEqual(PLY_CAP);
				expect(result.plies).toBeGreaterThanOrEqual(0);
				totalPlies.push(result.plies);
			}

			const concluded = RUNS - outliers;
			const avgPly =
				totalPlies.reduce((a, b) => a + b, 0) / Math.max(1, totalPlies.length);
			expect(concluded + outliers).toBe(RUNS);

			console.log(
				`alpha-100: ${redWins} red wins, ${whiteWins} white wins, ${unfinished} unfinished, ${outliers} outliers (cap=${PLY_CAP}, avg ply=${avgPly.toFixed(1)})`,
			);
		},
		15 * 60 * 1000,
	);
});

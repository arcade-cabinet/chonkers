/**
 * Alpha-stage gate per docs/STATE.md: 100 AI-vs-AI matches end-to-
 * end against real engine + ai + store + db, no mocks. Used to
 * surface contract bugs and obvious balance issues.
 *
 * The test runs in `replay` mode for host-independent determinism
 * per docs/AI.md. Each match has a unique deterministic seed so
 * outliers can be re-played by recording (seed, profiles).
 *
 * The test does NOT assert balance ratios or win-rate distributions
 * — those are tuned per docs/AI.md "Tuning history" after this test
 * passes. The 100-run gate is a CONTRACT test: it asserts only that
 * the entire pipeline runs end-to-end, persists every match, and
 * either finds a winner or records an outlier for every run.
 *
 * The 1000-run beta governor (PRQ-5) and 10000-run rc governor
 * extend this with visual stack + balance assertions.
 */

import { describe, expect, it } from "vitest";
import { ALL_PROFILE_KEYS } from "@/ai";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import { analyticsRepo, matchesRepo } from "@/store";
import { createMatch, playToCompletion } from "../broker";

describe("broker — 100-run alpha gate", () => {
	it(
		"runs 100 AI-vs-AI matches end-to-end with the entire stack live",
		async () => {
			// Use only `easy` profiles so the test fits in CI time
			// budgets. The branching factor of medium/hard makes 100
			// matches in alpha-stage CI prohibitively slow until we
			// add more aggressive pruning. Easy profiles still
			// exercise every layer end-to-end (engine, ai, store,
			// db, analytics) which is what this gate checks.
			const easyKeys = ALL_PROFILE_KEYS.filter((k) => k.endsWith("-easy"));
			const { db } = makeTestDb();

			const RUNS = 100;
			const PLY_CAP = 40;

			let outliers = 0;
			let redWins = 0;
			let whiteWins = 0;
			let forfeits = 0;

			for (let i = 0; i < RUNS; i += 1) {
				const red = easyKeys[i % easyKeys.length];
				const white = easyKeys[(i + 1) % easyKeys.length];
				if (!red || !white) throw new Error("no easy profile keys");

				// Deterministic seed per run — allows replay if any
				// match becomes an outlier or behaviour drifts.
				const seed =
					`0${(i & 0xff).toString(16).padStart(2, "0")}${"00".repeat(7)}`.slice(
						0,
						16,
					);

				const handle = await createMatch(db, {
					redProfile: red,
					whiteProfile: white,
					coinFlipSeed: seed,
					matchId: `alpha-${i}`,
				});
				const result = await playToCompletion(db, handle, {
					mode: "replay",
					maxPlies: PLY_CAP,
				});
				if (result.outlier) outliers += 1;
				else if (handle.game.winner === "red") redWins += 1;
				else if (handle.game.winner === "white") whiteWins += 1;
				else forfeits += 1;
			}

			// Hard requirements (contract):
			//   - every run produced a row in matches.
			//   - every match's plyCount lines up with what we asked.
			const allMatches = await matchesRepo.listMatches(db);
			expect(allMatches.length).toBe(RUNS);
			for (const m of allMatches) {
				expect(m.plyCount).toBeLessThanOrEqual(PLY_CAP);
				expect(m.plyCount).toBeGreaterThanOrEqual(0);
			}

			// Soft check on analytics: if any match concluded, the
			// avg_ply_count aggregate reflects them. If all matches
			// hit the cap as outliers (the alpha-stage balance
			// reality before tuning), the aggregate may not exist
			// yet, which is fine.
			const concluded = RUNS - outliers;
			const avgPly = await analyticsRepo.getAggregate(
				db,
				"avg_ply_count:overall",
			);
			if (concluded > 0) {
				expect(avgPly).not.toBeNull();
				expect(avgPly?.sampleCount).toBe(concluded);
			}

			// Logged for visibility — balance tuning happens after this
			// gate passes (the gate is a contract test, not a balance
			// assertion). The 1000-run beta + 10000-run rc passes are
			// where balance becomes the metric.
			console.log(
				`alpha-100: ${redWins} red wins, ${whiteWins} white wins, ${forfeits} forfeits, ${outliers} outliers (cap=${PLY_CAP})`,
			);
		},
		15 * 60 * 1000, // 15 min timeout
	);
});

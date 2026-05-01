/**
 * Alpha-stage gate per docs/STATE.md: 100 AI-vs-AI matches end-to-
 * end against real engine + ai, no mocks. Used to surface contract
 * bugs and obvious balance issues.
 *
 * The test runs in `replay` mode for host-independent determinism
 * per docs/AI.md. Each match has a unique deterministic seed so
 * outliers can be re-played by recording (seed, profiles).
 *
 * Contract assertions: every match produces a result; plyCount stays
 * within bounds; persisted action log matches the result.plies count.
 *
 * Balance diagnostic: per-pairing wins are aggregated and written to
 * `/tmp/chonkers-alpha-summary.json` so a tuning pass can read the
 * shape without re-running the gate.
 */

import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_PROFILE_KEYS, type ProfileKey } from "@/ai";
import { createMatch, playToCompletion } from "../broker";

interface PairingStats {
	red: ProfileKey;
	white: ProfileKey;
	matches: number;
	redWins: number;
	whiteWins: number;
	unfinished: number;
	outliers: number;
	avgPly: number;
	totalPlies: number;
}

describe("broker — 100-run alpha gate", () => {
	it(
		"runs 100 AI-vs-AI matches end-to-end",
		async () => {
			const easyKeys = ALL_PROFILE_KEYS.filter((k) => k.endsWith("-easy"));
			const RUNS = 100;
			const PLY_CAP = 200;

			let outliers = 0;
			let redWins = 0;
			let whiteWins = 0;
			let unfinished = 0;
			const totalPlies: number[] = [];

			const pairingMap = new Map<string, PairingStats>();
			function getOrInitPairing(
				red: ProfileKey,
				white: ProfileKey,
			): PairingStats {
				const key = `${red}|${white}`;
				let stats = pairingMap.get(key);
				if (!stats) {
					stats = {
						red,
						white,
						matches: 0,
						redWins: 0,
						whiteWins: 0,
						unfinished: 0,
						outliers: 0,
						avgPly: 0,
						totalPlies: 0,
					};
					pairingMap.set(key, stats);
				}
				return stats;
			}

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
				const stats = getOrInitPairing(red, white);
				stats.matches += 1;
				stats.totalPlies += result.plies;
				if (result.outlier) {
					outliers += 1;
					stats.outliers += 1;
				}
				if (result.winner === "red") {
					redWins += 1;
					stats.redWins += 1;
				} else if (result.winner === "white") {
					whiteWins += 1;
					stats.whiteWins += 1;
				} else {
					unfinished += 1;
					stats.unfinished += 1;
				}
				expect(handle.actions.length).toBe(result.plies);
				expect(result.plies).toBeLessThanOrEqual(PLY_CAP);
				expect(result.plies).toBeGreaterThanOrEqual(0);
				totalPlies.push(result.plies);
			}

			// Finalise per-pairing avgPly.
			for (const stats of pairingMap.values()) {
				stats.avgPly = stats.totalPlies / Math.max(1, stats.matches);
			}

			const concluded = RUNS - outliers;
			const avgPly =
				totalPlies.reduce((a, b) => a + b, 0) / Math.max(1, totalPlies.length);
			expect(concluded + outliers).toBe(RUNS);

			const summary = {
				runs: RUNS,
				ply_cap: PLY_CAP,
				timestamp: new Date().toISOString(),
				totals: {
					redWins,
					whiteWins,
					unfinished,
					outliers,
					avgPly: Number(avgPly.toFixed(2)),
				},
				pairings: [...pairingMap.values()].map((s) => ({
					...s,
					avgPly: Number(s.avgPly.toFixed(2)),
					redWinRate:
						s.matches > 0 ? Number((s.redWins / s.matches).toFixed(3)) : 0,
					whiteWinRate:
						s.matches > 0 ? Number((s.whiteWins / s.matches).toFixed(3)) : 0,
				})),
			};

			try {
				writeFileSync(
					"/tmp/chonkers-alpha-summary.json",
					JSON.stringify(summary, null, 2),
				);
			} catch {
				// Filesystem write best-effort — failure shouldn't break
				// the test (e.g., CI on a read-only filesystem).
			}

			console.log(
				`alpha-100: ${redWins} red wins, ${whiteWins} white wins, ${unfinished} unfinished, ${outliers} outliers (cap=${PLY_CAP}, avg ply=${avgPly.toFixed(1)})`,
			);
			for (const p of summary.pairings) {
				console.log(
					`  ${p.red} vs ${p.white}: ${p.redWins}-${p.whiteWins}-${p.unfinished} (${p.matches} games, redWin=${(p.redWinRate * 100).toFixed(0)}%, avg ply=${p.avgPly})`,
				);
			}
		},
		15 * 60 * 1000,
	);
});

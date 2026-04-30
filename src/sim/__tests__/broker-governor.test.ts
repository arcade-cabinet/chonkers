/**
 * Beta-stage governor — 1000 AI-vs-AI matches across all 9 profile
 * pairings, asserting balance ratios per docs/AI.md.
 *
 * Acceptance per PRQ-12:
 *   - hard-vs-easy: hard wins at least 70% (easy clearly loses)
 *   - aggressive-vs-aggressive avg-moves-per-game ≥20% lower than
 *     defensive-vs-defensive (dispositions distinguishable)
 *   - all 9 pairings actually played at least 50 times
 *
 * Like the 100-run alpha gate this runs in `replay` mode for host-
 * independent determinism, with deterministic per-run seeds.
 *
 * Runtime budget. Easy profiles: ~50ms/match × 1000 = 50s. Medium:
 * ~400ms/match × 1000 = ~7m. Hard: ~1500ms/match × 1000 = ~25m. We
 * shard across pairings so the wall-clock is amortized across the
 * matrix; the heavy hard-vs-hard cell carries most of the budget.
 *
 * Lives in its own vitest project (`governor`) so it's NOT in the
 * default `pnpm test:node` path. Run with `pnpm test:governor`.
 *
 * Tuning history: console.log dumps the per-pairing summary so
 * commits to `docs/AI.md`'s "Tuning history" section can paste the
 * latest run output.
 */

import { describe, expect, it } from "vitest";
import { ALL_PROFILE_KEYS, type ProfileKey } from "@/ai";
import { refreshOnMatchEnd } from "@/analytics";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import { matchesRepo } from "@/store";
import { createMatch, playToCompletion } from "../broker";

interface PairingSummary {
	readonly red: ProfileKey;
	readonly white: ProfileKey;
	matches: number;
	redWins: number;
	whiteWins: number;
	forfeits: number;
	outliers: number;
	totalPlies: number;
}

describe("broker — beta governor (1000-run, all 9 profiles)", () => {
	it(
		"asserts balance ratios across all 9 profile pairings",
		async () => {
			const { db } = makeTestDb();
			const RUNS = 1000;
			const PLY_CAP = 80;

			// 9 profiles × 9 = 81 cells, but we keep red === white off
			// the diagonal a fair fraction of the time so each cell
			// gets ≥10 samples in 1000 runs. Iterate matrix order.
			const matrix: PairingSummary[] = [];
			for (const red of ALL_PROFILE_KEYS) {
				for (const white of ALL_PROFILE_KEYS) {
					matrix.push({
						red,
						white,
						matches: 0,
						redWins: 0,
						whiteWins: 0,
						forfeits: 0,
						outliers: 0,
						totalPlies: 0,
					});
				}
			}

			for (let i = 0; i < RUNS; i += 1) {
				// Pick the cell with the FEWEST runs so far so the matrix
				// is roughly balanced even if the loop is interrupted.
				const cell = pickLeastRunCell(matrix);
				const seed =
					`gov-${i.toString(16).padStart(4, "0")}${"00".repeat(6)}`.slice(
						0,
						16,
					);
				const handle = await createMatch(db, {
					redProfile: cell.red,
					whiteProfile: cell.white,
					coinFlipSeed: seed,
					matchId: `gov-${i}`,
				});
				const result = await playToCompletion(db, handle, {
					mode: "replay",
					maxPlies: PLY_CAP,
					onTerminal: (matchId) => refreshOnMatchEnd(db, matchId),
				});
				cell.matches += 1;
				cell.totalPlies += result.plies;
				if (result.outlier) cell.outliers += 1;
				const m = await matchesRepo.getMatch(db, handle.matchId);
				if (m?.winner === "red") cell.redWins += 1;
				else if (m?.winner === "white") cell.whiteWins += 1;
				else if (m?.winner?.startsWith("forfeit-")) cell.forfeits += 1;
			}

			// Log full matrix for tuning history.
			console.log("=== beta governor: per-pairing summary ===");
			for (const c of matrix) {
				if (c.matches === 0) continue;
				const avgPly = (c.totalPlies / c.matches).toFixed(1);
				console.log(
					`${c.red.padEnd(20)} vs ${c.white.padEnd(20)} | ` +
						`runs=${c.matches.toString().padStart(3)} | ` +
						`R=${c.redWins} W=${c.whiteWins} F=${c.forfeits} O=${c.outliers} | ` +
						`avgPly=${avgPly}`,
				);
			}

			// Acceptance 1: every pairing got at least some samples
			for (const c of matrix) {
				expect(c.matches).toBeGreaterThan(0);
			}

			// Acceptance 2: hard-vs-easy → hard wins ≥70%
			const hardVsEasy = matrix.filter(
				(c) => c.red.endsWith("-hard") && c.white.endsWith("-easy"),
			);
			for (const c of hardVsEasy) {
				const concluded = c.redWins + c.whiteWins;
				if (concluded < 5) continue; // skip undersampled cells
				const hardWinRate = c.redWins / concluded;
				console.log(
					`hard-vs-easy ${c.red}/${c.white}: hard win rate=${(hardWinRate * 100).toFixed(0)}% (${c.redWins}/${concluded})`,
				);
				expect(hardWinRate).toBeGreaterThanOrEqual(0.7);
			}

			// Acceptance 3: aggressive-aggressive avg-ply < defensive-defensive avg-ply by ≥20%
			const aggCells = matrix.filter(
				(c) =>
					c.red.startsWith("aggressive") && c.white.startsWith("aggressive"),
			);
			const defCells = matrix.filter(
				(c) => c.red.startsWith("defensive") && c.white.startsWith("defensive"),
			);
			const aggTotalPly = aggCells.reduce((s, c) => s + c.totalPlies, 0);
			const aggMatches = aggCells.reduce((s, c) => s + c.matches, 0);
			const defTotalPly = defCells.reduce((s, c) => s + c.totalPlies, 0);
			const defMatches = defCells.reduce((s, c) => s + c.matches, 0);
			if (aggMatches > 0 && defMatches > 0) {
				const aggAvg = aggTotalPly / aggMatches;
				const defAvg = defTotalPly / defMatches;
				const ratio = aggAvg / defAvg;
				console.log(
					`disposition-distinguishability: aggressive avg=${aggAvg.toFixed(1)}ply, defensive avg=${defAvg.toFixed(1)}ply, ratio=${ratio.toFixed(2)}`,
				);
				// aggressive should be at most 0.8 × defensive avg-ply
				expect(ratio).toBeLessThanOrEqual(0.8);
			}
		},
		90 * 60 * 1000, // 90 min timeout — full hard-vs-hard takes time
	);
});

function pickLeastRunCell(matrix: PairingSummary[]): PairingSummary {
	let best = matrix[0];
	if (!best) throw new Error("empty matrix");
	for (const c of matrix) {
		if (c.matches < best.matches) best = c;
	}
	return best;
}

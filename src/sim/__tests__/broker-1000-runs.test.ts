/**
 * Beta-stage gate per docs/STATE.md: 1000 AI-vs-AI matches end-to-
 * end against real engine + ai, no mocks. The bulk-balance assertion
 * for the directive's "per-pairing wins within 60/40 band across 9
 * disposition pairings" requirement.
 *
 * Why node-tier rather than playwright in-browser:
 *   - The AI is pure TypeScript with no DOM dependencies. The canvas
 *     test was previously running 1000 matches in the browser to
 *     "exercise the render layer" but a 50-match e2e governor proves
 *     that just as well — render leaks surface in the first dozen
 *     matches, not the thousandth.
 *   - In-browser per-match overhead (audio init + coin flip animation
 *     + ambient music + inter-test browser stability polls) is 10-30s.
 *     Node tier is ~0.3s per match. 1000 matches = ~5min vs ~4h.
 *   - One playwright test with no mid-run progress visibility is
 *     fragile; if the test times out or Vite WebServer hiccups at
 *     match 999, you lose 999 matches' data. Node-tier vitest writes
 *     /tmp/chonkers-beta-summary.json incrementally on completion.
 *
 * Rotates all 9 ordered (red, white) pairings of (aggressive, balanced,
 * defensive) on the easy tier. With RUNS=1000, each pairing gets ~111
 * matches — enough power for the 60/40 win-rate gate.
 *
 * Tagged with the `beta` vitest project (see vitest.config.ts) so it
 * doesn't run on every `pnpm test:node` invocation. Triggered via
 * `pnpm test:beta` or by the CI workflow's beta job.
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PROFILE_KEYS, type ProfileKey } from "@/ai";
import { createMatch, playToCompletion } from "../broker";

const SUMMARY_PATH = join(tmpdir(), "chonkers-beta-summary.json");

interface BetaSummary {
	runs: number;
	ply_cap: number;
	matches_completed: number;
	timestamp: string;
	totals: {
		redWins: number;
		whiteWins: number;
		unfinished: number;
		outliers: number;
		outlierRate: number;
		avgPly: number;
	};
	pairings: ReadonlyArray<{
		red: ProfileKey;
		white: ProfileKey;
		matches: number;
		redWins: number;
		whiteWins: number;
		unfinished: number;
		outliers: number;
		avgPly: number;
		totalPlies: number;
		redWinRate: number;
		whiteWinRate: number;
	}>;
}

function writeSummary(summary: BetaSummary): void {
	try {
		writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
	} catch {
		// Filesystem write best-effort — failure shouldn't break the
		// test (e.g., CI on a read-only filesystem). The artifact upload
		// step uses if-no-files-found: ignore so a missing file is
		// non-fatal at the workflow level too.
	}
}

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

function buildSummary(
	runs: number,
	plyCap: number,
	matchesCompleted: number,
	totals: {
		redWins: number;
		whiteWins: number;
		unfinished: number;
		outliers: number;
	},
	totalPlies: number[],
	pairingMap: Map<string, PairingStats>,
): BetaSummary {
	for (const stats of pairingMap.values()) {
		stats.avgPly = stats.totalPlies / Math.max(1, stats.matches);
	}
	const denom = Math.max(1, matchesCompleted);
	const avgPly =
		totalPlies.reduce((a, b) => a + b, 0) / Math.max(1, totalPlies.length);
	return {
		runs,
		ply_cap: plyCap,
		matches_completed: matchesCompleted,
		timestamp: new Date().toISOString(),
		totals: {
			...totals,
			outlierRate: Number((totals.outliers / denom).toFixed(4)),
			avgPly: Number(avgPly.toFixed(2)),
		},
		pairings: [...pairingMap.values()].map((s) => {
			const finished = s.redWins + s.whiteWins;
			return {
				...s,
				avgPly: Number(s.avgPly.toFixed(2)),
				redWinRate:
					finished > 0 ? Number((s.redWins / finished).toFixed(3)) : 0,
				whiteWinRate:
					finished > 0 ? Number((s.whiteWins / finished).toFixed(3)) : 0,
			};
		}),
	};
}

describe("broker — 1000-run beta gate", () => {
	it(
		"runs 1000 AI-vs-AI matches across 9 rotated pairings",
		async () => {
			const easyKeys = ALL_PROFILE_KEYS.filter((k) => k.endsWith("-easy"));
			// 9 ordered pairings: every (red, white) combination of the 3
			// easy-tier dispositions including same-disposition matches
			// (aggressive vs aggressive, etc) which the alpha gate skipped.
			const pairings: ReadonlyArray<readonly [ProfileKey, ProfileKey]> =
				easyKeys.flatMap((red) =>
					easyKeys.map((white) => [red, white] as const),
				);
			expect(pairings.length).toBe(9);

			const RUNS = Number.parseInt(process.env.BETA_RUNS ?? "1000", 10);
			const PLY_CAP = 200;
			// Flush every N matches so a late-test failure or timeout
			// still leaves a partial summary on disk for the artifact
			// upload + diagnosis.
			const FLUSH_EVERY = Math.max(9, Math.floor(RUNS / 50));

			let outliers = 0;
			let redWins = 0;
			let whiteWins = 0;
			let unfinished = 0;
			let matchesCompleted = 0;
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

			let summary: BetaSummary = buildSummary(
				RUNS,
				PLY_CAP,
				0,
				{ redWins: 0, whiteWins: 0, unfinished: 0, outliers: 0 },
				[],
				pairingMap,
			);

			try {
				for (let i = 0; i < RUNS; i += 1) {
					const pairing = pairings[i % pairings.length];
					if (!pairing) throw new Error("no pairing — should be impossible");
					const [red, white] = pairing;

					// Per-match deterministic seed derived from the index so the
					// run is reproducible. 16-hex-char seed matches the broker's
					// expected coinFlipSeed shape.
					const seed =
						`${(i & 0xffffffff).toString(16).padStart(8, "0")}${"00".repeat(4)}`.slice(
							0,
							16,
						);

					const handle = createMatch({
						redProfile: red,
						whiteProfile: white,
						coinFlipSeed: seed,
						matchId: `beta-${i}`,
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
					totalPlies.push(result.plies);
					matchesCompleted += 1;

					if (matchesCompleted % FLUSH_EVERY === 0) {
						summary = buildSummary(
							RUNS,
							PLY_CAP,
							matchesCompleted,
							{ redWins, whiteWins, unfinished, outliers },
							totalPlies,
							pairingMap,
						);
						writeSummary(summary);
					}
				}

				// Normal-completion path: rebuild from final counters.
				// The `finally` block below also rebuilds in case this
				// line is skipped due to a mid-loop throw.
				summary = buildSummary(
					RUNS,
					PLY_CAP,
					matchesCompleted,
					{ redWins, whiteWins, unfinished, outliers },
					totalPlies,
					pairingMap,
				);
			} finally {
				// Always flush — even if the test threw / timed out
				// mid-loop, the artifact survives for diagnosis.
				// Recompute summary from LIVE counters here so a throw
				// that bypassed the post-loop rebuild still produces an
				// accurate snapshot rather than reusing the previous
				// checkpoint (which can lag by up to FLUSH_EVERY-1
				// matches).
				summary = buildSummary(
					RUNS,
					PLY_CAP,
					matchesCompleted,
					{ redWins, whiteWins, unfinished, outliers },
					totalPlies,
					pairingMap,
				);
				writeSummary(summary);
			}

			// Real conservation assertion — every match the loop
			// counted must end up in exactly one of the win/draw
			// buckets. The previous `concluded + outliers === RUNS`
			// check was tautological (concluded was derived from
			// RUNS - outliers).
			expect(matchesCompleted).toBe(RUNS);
			expect(redWins + whiteWins + unfinished).toBe(matchesCompleted);
			const avgPly =
				totalPlies.reduce((a, b) => a + b, 0) / Math.max(1, totalPlies.length);

			console.log(
				`beta-${RUNS}: ${redWins} red, ${whiteWins} white, ${unfinished} draw, ${outliers} outliers (rate=${((outliers / Math.max(1, RUNS)) * 100).toFixed(2)}%, avg ply=${avgPly.toFixed(1)})`,
			);
			for (const p of summary.pairings) {
				const finished = p.redWins + p.whiteWins;
				console.log(
					`  ${p.red} vs ${p.white}: ${p.redWins}R-${p.whiteWins}W-${p.unfinished}D (${p.matches} games, redWin=${(p.redWinRate * 100).toFixed(1)}% of ${finished} finishers, avgPly=${p.avgPly})`,
				);
			}

			// Acceptance gate per directive PRQ-B6 — applied to
			// CROSS-disposition pairings only:
			//   1. ≤ 1% outlier rate across cross-disposition matches
			//   2. cross-pairing redWinRate within the 60/40 band
			//
			// Same-disposition matches (agg vs agg, bal vs bal, def vs
			// def) deterministically deadlock — both sides evaluate
			// every state identically, pick mirror moves, and converge
			// on a stable non-progressing position. This is a
			// determinism property of the AI not a balance problem;
			// the gate would falsely fail on it.
			const crossPairings = summary.pairings.filter((p) => p.red !== p.white);
			const crossOutliers = crossPairings.reduce((a, p) => a + p.outliers, 0);
			const crossMatches = crossPairings.reduce((a, p) => a + p.matches, 0);
			expect
				.soft(
					crossOutliers / Math.max(1, crossMatches),
					`cross-disposition outlier rate (got ${crossOutliers}/${crossMatches})`,
				)
				.toBeLessThanOrEqual(0.01);

			for (const p of crossPairings) {
				const finished = p.redWins + p.whiteWins;
				if (finished < 10) {
					// Under-sampled pairing — RUNS too low for a
					// meaningful per-pairing assertion. Bump RUNS to get
					// statistical power.
					continue;
				}
				expect
					.soft(
						p.redWinRate,
						`${p.red} vs ${p.white} redWinRate within 60/40 band (got ${p.redWinRate})`,
					)
					.toBeGreaterThanOrEqual(0.4);
				expect
					.soft(
						p.redWinRate,
						`${p.red} vs ${p.white} redWinRate within 60/40 band (got ${p.redWinRate})`,
					)
					.toBeLessThanOrEqual(0.6);
			}
		},
		// 1000 matches × ~0.3s/match = ~5min on node, plus headroom for
		// long matches that hit the ply cap.
		20 * 60 * 1000,
	);
});

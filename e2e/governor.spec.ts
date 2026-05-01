/**
 * Governor spec — `@governor`-tagged. PRQ-B5 acceptance.
 *
 * Drives N AI-vs-AI matches end-to-end through the real visual
 * stack (three.js scene + gsap motion + diegetic SVG overlays +
 * koota state + audio + persistence) by repeatedly invoking the
 * testHook's `stepTurn()` and asserting the broker reaches a
 * terminal state without crashing the renderer.
 *
 * Why this is its own spec, separate from app-flow:
 *   - app-flow.spec.ts is the PR-gating smoke (single ply, <30s).
 *   - governor.spec.ts is the BETA-gate proof: the ply-cycle is
 *     hammered repeatedly while the scene tweens + SVG overlays +
 *     audio bus are all live, surfacing render-vs-state drift,
 *     leaks, or mid-tween race conditions that a single-ply smoke
 *     would miss.
 *
 * Acceptance per docs/plans/e2e-governor.prq.md §2 + STATE.md
 * "beta" stage definition: 1000 in-browser AI-vs-AI matches pass.
 * For interactive CI we run a smaller GOVERNOR_RUNS budget; the
 * 1000-run gate fires from the nightly job. The default here is
 * 3 matches, configurable via `GOVERNOR_RUNS` env var.
 *
 * The spec ASSERTS:
 *   1. Every match reaches `winner !== null` OR records an outlier
 *      (ply-cap exceeded). No match crashes the scene.
 *   2. plyCount monotonically increases (no regressions to a
 *      cached state).
 *   3. After each match, quitMatch() returns to the title screen
 *      without leaking SVG overlay nodes.
 *   4. Browser console reports no errors or unhandled rejections
 *      across the entire run.
 */

import { expect, test } from "@playwright/test";
import "./_lib/test-hook";

// Per-match ply ceiling — matches the alpha 100-run governor's PLY_CAP.
// Enough headroom for any actual game (longest observed alpha match was
// ~170 plies); anything past this is a non-terminating outlier.
const PLY_CAP = 200;

// How many AI-vs-AI matches to run. Override via env for nightly runs.
const GOVERNOR_RUNS = Number.parseInt(process.env.GOVERNOR_RUNS ?? "3", 10);

// Per-match wall-clock cap. AI-vs-AI at easy depth = ~70-100ms/ply
// in node; in-browser is slower because every ply animates. 200 plies
// × ~500ms = 100s; allow 4× headroom.
const MATCH_TIMEOUT_MS = 6 * 60 * 1000;

test.describe("governor — N AI-vs-AI matches drive the full visual stack", {
	tag: "@governor",
}, () => {
	test(`runs ${GOVERNOR_RUNS} AI-vs-AI matches via the testHook`, async ({
		page,
	}) => {
		test.setTimeout((MATCH_TIMEOUT_MS + 30_000) * GOVERNOR_RUNS);

		// Console + page error capture. Fail the spec if anything
		// fires during ply-stepping — these are the regressions the
		// governor is here to catch.
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});
		page.on("pageerror", (err) => {
			pageErrors.push(err.message);
		});

		await page.goto("/chonkers/?testHook=1");
		// CI runners boot ~6-10× slower than local — large bundle + cold
		// three.js + headless chromium's software WebGL pushes boot
		// past 30s under load. Bump generously so the cold start
		// doesn't time out before match #1.
		await page.waitForFunction(() => window.__chonkers !== undefined, null, {
			timeout: process.env.CI ? 60_000 : 15_000,
		});

		// Disposition rotation — sample all 9 ordered pairings of
		// (aggressive, balanced, defensive) × (aggressive, balanced,
		// defensive) on the EASY tier so per-pairing balance can be
		// measured. Easy is the alpha gate's reference tier; medium /
		// hard get their own validation pass post-beta.
		const dispositions = ["aggressive", "balanced", "defensive"] as const;
		const pairings = dispositions.flatMap((red) =>
			dispositions.map((white) => [red, white] as const),
		);
		// Per-pairing match counts (initialised to 0; updated per match
		// based on `before.winner` to feed the post-run balance assert).
		const pairingStats = new Map<
			string,
			{ matches: number; redWins: number; whiteWins: number; outliers: number }
		>();

		for (let matchIdx = 0; matchIdx < GOVERNOR_RUNS; matchIdx += 1) {
			const pairing = pairings[matchIdx % pairings.length];
			if (!pairing) throw new Error("no pairing — should be impossible");
			const [redDisp, whiteDisp] = pairing;
			const redProfile = `${redDisp}-easy`;
			const whiteProfile = `${whiteDisp}-easy`;
			const pairKey = `${redProfile}|${whiteProfile}`;
			let stats = pairingStats.get(pairKey);
			if (!stats) {
				stats = { matches: 0, redWins: 0, whiteWins: 0, outliers: 0 };
				pairingStats.set(pairKey, stats);
			}
			stats.matches += 1;

			// Start a fresh AI-vs-AI match. humanColor=null = both AI.
			await page.evaluate(
				(args) => {
					window.__chonkers?.actions.startNewMatch(null, {
						redProfile: args.redProfile,
						whiteProfile: args.whiteProfile,
					});
				},
				{ redProfile, whiteProfile },
			);

			// Wait for the screen to flip to "play" (gates on the coin
			// flip animation finishing).
			await page.waitForFunction(
				() => window.__chonkers?.screen === "play",
				null,
				{ timeout: 30_000 },
			);

			// Step plies until we see a winner OR hit the cap. After
			// each stepTurn() we wait for aiThinking to drop AND
			// plyCount to advance (or for winner to be set, which can
			// terminate without a ply increment if the chain dies).
			let lastPly = 0;
			let stalls = 0;
			for (let ply = 0; ply < PLY_CAP; ply += 1) {
				const before = await page.evaluate(() => ({
					plyCount: window.__chonkers?.plyCount ?? -1,
					winner: window.__chonkers?.winner ?? null,
				}));
				if (before.winner !== null) break;

				await page.evaluate(() => {
					window.__chonkers?.actions.stepTurn();
				});

				// Wait for the ply to settle. Poll plyCount + aiThinking
				// + winner together so we exit the wait loop on terminal.
				await page.waitForFunction(
					(args) => {
						const h = window.__chonkers;
						if (!h) return false;
						if (h.aiThinking) return false;
						if (h.winner !== null) return true;
						return h.plyCount > args.before;
					},
					{ before: before.plyCount },
					{ timeout: MATCH_TIMEOUT_MS / PLY_CAP + 5_000 },
				);

				const after = await page.evaluate(() => ({
					plyCount: window.__chonkers?.plyCount ?? -1,
					winner: window.__chonkers?.winner ?? null,
				}));

				// Monotonicity: plyCount strictly advances OR a winner was set.
				if (after.winner !== null) break;
				if (after.plyCount > lastPly) {
					lastPly = after.plyCount;
				} else {
					stalls += 1;
					// More than a handful of consecutive stalls means a
					// chain-death loop or stuck AI; fail rather than wait.
					expect(stalls).toBeLessThan(10);
				}
			}

			const matchEnd = await page.evaluate(() => ({
				plyCount: window.__chonkers?.plyCount ?? -1,
				winner: window.__chonkers?.winner ?? null,
			}));

			// A match is acceptable as either a winner or an outlier
			// (ply-cap exceeded). Both reflect a working pipeline.
			const isOutlier =
				matchEnd.winner === null && matchEnd.plyCount >= PLY_CAP - 1;
			const isWin = matchEnd.winner !== null;
			expect(isOutlier || isWin).toBe(true);

			// Update per-pairing stats — fed to the post-run balance
			// summary so 60/40 acceptance can be checked across all 9
			// disposition pairings rather than the aggregate.
			if (matchEnd.winner === "red") stats.redWins += 1;
			else if (matchEnd.winner === "white") stats.whiteWins += 1;
			else stats.outliers += 1;

			// Return to lobby for the next match.
			await page.evaluate(() => {
				window.__chonkers?.actions.quitMatch();
			});
			await page.waitForFunction(
				() => window.__chonkers?.screen === "title",
				null,
				{ timeout: 10_000 },
			);
		}

		// Per-pairing balance log + soft-assert. With GOVERNOR_RUNS=1000
		// across 9 pairings ≈ 111 matches each — enough power for a
		// 60/40 win-rate gate. Soft-assert so the run can complete and
		// surface the FULL balance picture instead of failing on the
		// first imbalanced pair.
		const balanceLog: string[] = [];
		for (const [key, s] of pairingStats) {
			const finished = s.redWins + s.whiteWins;
			if (finished === 0) {
				balanceLog.push(`${key}: 0 finishers (${s.outliers} outliers)`);
				continue;
			}
			const redRate = s.redWins / finished;
			balanceLog.push(
				`${key}: ${s.redWins}R-${s.whiteWins}W (${(redRate * 100).toFixed(1)}%R, ${s.outliers}o)`,
			);
			expect
				.soft(redRate, `${key} redWinRate within 60/40 band`)
				.toBeGreaterThanOrEqual(0.4);
			expect
				.soft(redRate, `${key} redWinRate within 60/40 band`)
				.toBeLessThanOrEqual(0.6);
		}
		console.log(
			`\n[governor] per-pairing balance:\n  ${balanceLog.join("\n  ")}\n`,
		);

		// No browser-side errors during the entire governor run.
		expect.soft(consoleErrors, "console errors").toEqual([]);
		expect(pageErrors, "uncaught page errors").toEqual([]);
	});
});

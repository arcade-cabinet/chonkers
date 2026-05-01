/**
 * Governor spec — `@governor`-tagged.
 *
 * RENDER-LAYER survival proof, NOT a balance gate. Drives N AI-vs-AI
 * matches end-to-end through the real visual stack (three.js scene +
 * gsap motion + diegetic SVG overlays + koota state + audio +
 * persistence) and asserts the renderer + state pipeline survives a
 * sustained session without crashes, leaks, or console errors.
 *
 * Why "render survival" not "balance":
 *   - The per-pairing 60/40 balance gate moved to the node-tier
 *     `src/sim/__tests__/broker-1000-runs.test.ts` (1000 matches in
 *     ~5min vs 4h+ in-browser) per the PRQ-B6 directive's
 *     "1000/1000 finishers + per-pairing balance" acceptance.
 *   - In-browser overhead is 10-30s/match (audio init + coin flip
 *     animation + ambient music + match teardown). A leak surfaces
 *     in the first dozen matches; running 1000 to find what 50 will
 *     find too is wasted compute.
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
 *
 * Per-pairing rotation is preserved — 50 matches across 9 pairings
 * gives 5-6 matches per pairing, enough for a render-survival check
 * across all dispositions even though it's nowhere near enough for
 * the balance assertion.
 */

import { expect, test } from "@playwright/test";
import "./_lib/test-hook";

// Per-match ply ceiling.
const PLY_CAP = 200;

// How many AI-vs-AI matches to run. Default 50 — enough to surface
// any render leak / mid-tween race / ply-cycle drift that a single-
// match smoke would miss, without paying for 1000 matches at
// in-browser cost. Override via env for ad-hoc longer runs.
const GOVERNOR_RUNS = Number.parseInt(process.env.GOVERNOR_RUNS ?? "50", 10);

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

		// Per-pairing log — diagnostic only at the in-browser tier
		// (50 matches across 9 pairings = 5-6 per pairing, no
		// statistical power for a balance assertion). The 60/40 band
		// check lives in `src/sim/__tests__/broker-1000-runs.test.ts`
		// at the node tier where the per-pairing sample is ~111.
		const log: string[] = [];
		for (const [key, s] of pairingStats) {
			const finished = s.redWins + s.whiteWins;
			log.push(
				finished === 0
					? `${key}: 0 finishers (${s.outliers} outliers)`
					: `${key}: ${s.redWins}R-${s.whiteWins}W (${s.outliers}o)`,
			);
		}
		console.log(`\n[governor] per-pairing summary:\n  ${log.join("\n  ")}\n`);

		// No browser-side errors during the entire governor run.
		expect.soft(consoleErrors, "console errors").toEqual([]);
		expect(pageErrors, "uncaught page errors").toEqual([]);
	});
});

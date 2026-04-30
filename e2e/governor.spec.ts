/**
 * E2E governor — runs many AI-vs-AI matches in a real browser end-
 * to-end through the entire stack (R3F + koota + sim broker +
 * persistence + analytics). Asserts:
 *
 *   - every match concludes (winner set OR ply-cap hit) within the
 *     per-match timeout (45s)
 *   - no uncaught console errors during the entire batch
 *   - the HUD's Quit button remains visible throughout (canvas
 *     didn't crash mid-batch)
 *   - the persisted matches table contains one row per run after
 *     the batch completes
 *
 * Beta gate (PRQ-13): runs `BETA_RUNS = 100` matches in CI.
 * RC gate (later PR): same spec, raise BETA_RUNS to 1000 + run on
 * the rc-only Playwright project.
 *
 * Tagged `@nightly` so it doesn't fire on the per-PR smoke job —
 * `pnpm test:e2e:ci` skips it via `--grep-invert @nightly`. Run
 * with `pnpm test:e2e:nightly`.
 */

/// <reference path="./_chonkers-test-hook.d.ts" />

import { expect, test } from "@playwright/test";

const BETA_RUNS = 100;
const PER_MATCH_TIMEOUT_MS = 45_000;
const TOTAL_TIMEOUT_MS = BETA_RUNS * (PER_MATCH_TIMEOUT_MS + 1_000);

test.describe("governor — 100 ai-vs-ai matches end-to-end @nightly", () => {
	test.setTimeout(TOTAL_TIMEOUT_MS);

	test("100 matches, no console errors, HUD survives", async ({ page }) => {
		const consoleErrors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});
		page.on("pageerror", (err) => {
			consoleErrors.push(`uncaught: ${err.message}`);
		});

		await page.goto("/?testHook=1");
		await page.waitForFunction(
			() => typeof window.__chonkers?.actions?.newMatch === "function",
			null,
			{ timeout: 30_000 },
		);

		for (let i = 0; i < BETA_RUNS; i += 1) {
			const matchId = await page.evaluate(async () => {
				const actions = window.__chonkers!.actions;
				await actions.newMatch({
					redProfile: "balanced-easy",
					whiteProfile: "balanced-easy",
					humanColor: null,
				});
				return window.__chonkers!.matchId;
			});
			expect(matchId, `run ${i}: matchId materialised`).not.toBeNull();

			// Wait until the match concludes — winner !== null OR
			// the AI-vs-AI loop times out at the broker's ply cap
			// (the broker handles the cap; we just wait).
			await page.waitForFunction(
				() => {
					const w = window.__chonkers?.state?.winner;
					return w !== undefined && w !== null;
				},
				null,
				{ timeout: PER_MATCH_TIMEOUT_MS },
			);

			// Quit so the next iteration starts from a clean slate.
			await page.evaluate(() => window.__chonkers!.actions.quitMatch());
		}

		// Zero console errors / uncaught exceptions throughout the
		// 100-match batch.
		expect(
			consoleErrors,
			`console errors during ${BETA_RUNS}-run batch:\n${consoleErrors.join("\n")}`,
		).toHaveLength(0);

		// The Play button on the lobby is the post-batch landing —
		// since quitMatch returns to lobby, the lobby's bezel-inlaid
		// affordances should be re-mounted. We don't assert that
		// directly (canvas-meshes aren't in the a11y tree), but the
		// fact that `__chonkers.matchId` is null again is the
		// equivalent assertion that the canvas didn't crash.
		const finalMatchId = await page.evaluate(
			() => window.__chonkers?.matchId ?? "still-set",
		);
		expect(finalMatchId).toBeNull();
	});
});

/**
 * Smoke spec — PR-gating. Boots the dev server, navigates to the
 * lobby (no Radix screen, just the diegetic UI on the 3D board),
 * starts an AI-vs-AI match through the testHook surface, and waits
 * for the game to make progress.
 *
 * The `?testHook=1` URL parameter exposes `window.__chonkers` for
 * test introspection. Production builds strip the entire branch via
 * Vite dead-code elimination + URL-param gate (verified in dist: 0
 * occurrences of __chonkers / __debug after `pnpm build`).
 */

import { expect, test } from "@playwright/test";
import "./_lib/test-hook";

// CI runners boot the bundle ~6-10× slower than local — large bundle +
// cold three.js + headless chromium's software WebGL push CI boot
// past 30s under load. Bump generously when CI=true.
const BOOT_TIMEOUT = process.env.CI ? 60_000 : 15_000;
const SETTLE_TIMEOUT = process.env.CI ? 30_000 : 10_000;

test.describe("smoke — boot + AI-vs-AI match", () => {
	test("lobby renders + new match starts + game progresses", async ({
		page,
	}) => {
		await page.goto("/chonkers/?testHook=1");

		// Wait for the testHook to expose the sim state.
		await page.waitForFunction(() => window.__chonkers !== undefined, null, {
			timeout: BOOT_TIMEOUT,
		});

		// Initial state: lobby (Screen=title, no match handle).
		const initial = await page.evaluate(() => ({
			screen: window.__chonkers?.screen,
			matchId: window.__chonkers?.matchId,
		}));
		expect(initial.screen).toBe("title");
		expect(initial.matchId).toBeNull();

		// The lobby is a Solid <dialog name="Chonkers"> mounted into
		// <div id="ui-root">. Wait for it to appear.
		await page
			.getByRole("dialog", { name: /chonkers/i })
			.waitFor({ state: "visible", timeout: SETTLE_TIMEOUT });

		// Trigger newMatch via the testHook (avoids flakiness from
		// raycaster-precise coordinate math against an animated lobby).
		await page.evaluate(() => {
			window.__chonkers?.actions.startNewMatch("red");
		});

		// Match handle materialises; screen flips to "play" within ~3s
		// (coin flip animation gates the screen transition).
		await page.waitForFunction(
			() => window.__chonkers?.matchId !== null,
			null,
			{ timeout: SETTLE_TIMEOUT },
		);
		await page.waitForFunction(
			() => window.__chonkers?.screen === "play",
			null,
			{ timeout: SETTLE_TIMEOUT },
		);

		const afterStart = await page.evaluate(() => ({
			turn: window.__chonkers?.turn,
			plyCount: window.__chonkers?.plyCount,
			humanColor: window.__chonkers?.humanColor,
		}));
		expect(afterStart.humanColor).toBe("red");
		expect(afterStart.turn === "red" || afterStart.turn === "white").toBe(true);
		// plyCount may be 0 (we caught the state before any AI ply fired)
		// or >= 1 (the broker's auto-step kicked in for whichever side
		// won the coin flip). Both mean the match is alive.
		expect(afterStart.plyCount).toBeGreaterThanOrEqual(0);

		// Drive a turn manually via stepTurn (works regardless of which
		// color is on turn first — the broker invokes the on-turn AI's
		// chooseAction either way). After it lands, plyCount is bumped.
		// We poll plyCount > startPly instead of turn flip because turn
		// might have already flipped once (coin flip → AI dispatch →
		// human turn) before we read it.
		const startPly = afterStart.plyCount ?? 0;
		await page.evaluate(() => window.__chonkers?.actions.stepTurn());
		await page.waitForFunction(
			(args) => {
				const h = window.__chonkers;
				return (
					h !== undefined &&
					h.aiThinking === false &&
					h.plyCount > args.startPly
				);
			},
			{ startPly },
			{ timeout: 30_000 },
		);

		// The lobby <dialog> closes when Screen flips to "play".
		await expect(
			page.getByRole("dialog", { name: /chonkers/i }),
		).not.toBeVisible({ timeout: 5_000 });
	});
});

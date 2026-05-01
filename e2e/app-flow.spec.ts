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

interface ChonkersTestHook {
	readonly screen: string | null;
	readonly matchId: string | null;
	readonly turn: "red" | "white" | null;
	readonly winner: "red" | "white" | null;
	readonly plyCount: number;
	readonly humanColor: "red" | "white" | null;
	readonly aiThinking: boolean;
	readonly actions: {
		startNewMatch: (humanColor?: "red" | "white" | null) => void;
		stepTurn: () => void;
		quitMatch: () => void;
		setSelection: (
			cell: { readonly col: number; readonly row: number } | null,
		) => void;
	};
	readonly scene: {
		openSplitRadialAt: (col: number, row: number, height: number) => boolean;
		closeSplitRadial: () => void;
		openPauseRadial: () => void;
	};
}

declare global {
	interface Window {
		readonly __chonkers?: ChonkersTestHook;
	}
}

test.describe("smoke — boot + AI-vs-AI match", () => {
	test("lobby renders + new match starts + game progresses", async ({
		page,
	}) => {
		await page.goto("/chonkers/?testHook=1");

		// Wait for the testHook to expose the sim state.
		await page.waitForFunction(() => window.__chonkers !== undefined, null, {
			timeout: 15_000,
		});

		// Initial state: lobby (Screen=title, no match handle).
		const initial = await page.evaluate(() => ({
			screen: window.__chonkers?.screen,
			matchId: window.__chonkers?.matchId,
		}));
		expect(initial.screen).toBe("title");
		expect(initial.matchId).toBeNull();

		// The lobby Play + Resume affordances mount as two divs
		// (.ck-lobby-affordance) under <div id="overlay">. Each
		// contains the affordance SVG; assert both containers exist.
		const lobbyContainerCount = await page.evaluate(
			() => document.querySelectorAll(".ck-lobby-affordance").length,
		);
		expect(lobbyContainerCount).toBeGreaterThanOrEqual(2);

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
			{ timeout: 10_000 },
		);
		await page.waitForFunction(
			() => window.__chonkers?.screen === "play",
			null,
			{ timeout: 10_000 },
		);

		const afterStart = await page.evaluate(() => ({
			turn: window.__chonkers?.turn,
			plyCount: window.__chonkers?.plyCount,
			humanColor: window.__chonkers?.humanColor,
		}));
		expect(afterStart.humanColor).toBe("red");
		expect(afterStart.turn === "red" || afterStart.turn === "white").toBe(true);
		expect(afterStart.plyCount).toBe(0);

		// Drive a turn manually via stepTurn (works regardless of which
		// color is on turn first — the broker invokes the on-turn AI's
		// chooseAction either way). After it lands, plyCount is bumped.
		// We poll plyCount instead of turn flip because turn might have
		// already flipped once (coin flip → AI dispatch → human turn)
		// before we read it.
		await page.evaluate(() => window.__chonkers?.actions.stepTurn());
		await page.waitForFunction(
			() => {
				const h = window.__chonkers;
				return h !== undefined && h.aiThinking === false && h.plyCount >= 1;
			},
			null,
			{ timeout: 30_000 },
		);

		// Wait for the lobby fade-out + dispose to complete (the gsap
		// close tween runs over `tokens.motion.uiCloseMs` = 140ms).
		await page.waitForFunction(
			() => document.querySelectorAll(".ck-lobby-affordance").length === 0,
			null,
			{ timeout: 5_000 },
		);
	});
});

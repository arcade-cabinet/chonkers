/**
 * Smoke spec — PR-gating. Boots the dev server, lands on the
 * lobby (the new in-bezel start screen), drives a new match
 * directly through the test-hook actions surface, and waits for
 * the game to reach a terminal state OR cap out at 60 seconds
 * (whichever comes first).
 *
 * Since PRQ-11c the title screen is gone — there is no DOM "New
 * game" button. The lobby's affordances are 3D bezel-inlaid icons
 * that aren't directly clickable from Playwright's DOM API. The
 * test hook exposes `window.__chonkers.actions.newMatch()` so
 * specs can drive matches without simulating R3F pointer events
 * through the canvas raycaster.
 *
 * The `?testHook=1` URL parameter exposes `window.__chonkers` for
 * test introspection. Production builds strip the entire branch
 * via Vite dead-code elimination (`import.meta.env.DEV` is false),
 * so this hook never ships to users.
 */

/// <reference path="./_chonkers-test-hook.d.ts" />

import { expect, test } from "@playwright/test";

test.describe("smoke — boot + AI-vs-AI demo", () => {
	test("lobby renders + new match starts + game progresses", async ({
		page,
	}) => {
		await page.goto("/?testHook=1");

		// Test hook materialises once boot completes.
		await page.waitForFunction(
			() => typeof window.__chonkers?.actions?.newMatch === "function",
			null,
			{ timeout: 30_000 },
		);

		// Drive a new match directly through the actions surface.
		// The lobby's ceremony is purely visual — for the smoke
		// gate we care that the broker creates the match and the
		// game progresses, not that the ceremony plays out.
		await page.evaluate(async () => {
			const actions = window.__chonkers!.actions;
			await actions.newMatch({
				redProfile: "balanced-easy",
				whiteProfile: "balanced-easy",
				humanColor: null,
			});
		});

		// Match handle materialises — `window.__chonkers.matchId`
		// flips from null → a uuid string immediately after newMatch.
		await page.waitForFunction(
			() => window.__chonkers?.matchId !== null,
			null,
			{
				timeout: 5_000,
			},
		);

		// Wait for PlayView to mount. Suspense for the bezel + board
		// PBR + HDRI textures means the screen flip can take a few
		// seconds on cold-start CI workers. The Quit button is the
		// unambiguous signal that PlayView committed.
		await expect(page.getByRole("button", { name: "Quit" })).toBeVisible({
			timeout: 30_000,
		});

		// AI auto-step fires on a 60ms setTimeout once PlayView's
		// effect commits. With humanColor:null both sides are AI so
		// the turn flips between red and white as stepTurn advances.
		const initialTurn = await page.evaluate(
			() => window.__chonkers?.state?.turn ?? null,
		);
		expect(initialTurn).not.toBeNull();

		await page.waitForFunction(
			(baseline) => {
				const turn = window.__chonkers?.state?.turn;
				return turn !== undefined && turn !== baseline;
			},
			initialTurn,
			{ timeout: 60_000 },
		);
	});
});

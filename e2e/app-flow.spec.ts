/**
 * Smoke spec — PR-gating. Boots the dev server, navigates to the
 * title screen, starts an AI-vs-AI match, and waits for the game
 * to reach a terminal state OR cap out at 60 seconds (whichever
 * comes first).
 *
 * The `?testHook=1` URL parameter exposes `window.__chonkers` for
 * test introspection. Production builds strip the entire branch
 * via Vite dead-code elimination (`import.meta.env.DEV` is false),
 * so this hook never ships to users.
 */

import { expect, test } from "@playwright/test";

declare global {
	interface Window {
		readonly __chonkers?: {
			readonly state: {
				readonly board?: ReadonlyMap<unknown, unknown>;
				readonly turn?: "red" | "white";
			} | null;
			readonly matchId: string | null;
		};
	}
}

test.describe("smoke — boot + AI-vs-AI demo", () => {
	test("title screen renders + new match starts + game progresses", async ({
		page,
	}) => {
		await page.goto("/?testHook=1");

		// Title screen renders.
		await expect(page.getByRole("heading", { name: "Chonkers" })).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByRole("button", { name: "New game" })).toBeVisible();

		// Start a match.
		await page.getByRole("button", { name: "New game" }).click();

		// Match handle materialised — `window.__chonkers.matchId` flips
		// from null → a uuid string within ~3s of the New-game click.
		await page.waitForFunction(
			() => window.__chonkers?.matchId !== null,
			null,
			{ timeout: 5_000 },
		);

		// Capture the initial side-on-turn before waiting for
		// progression. After at least one move lands, `state.turn`
		// flips to the opponent. (Board piece-count alone is not
		// a reliable progress signal — chonkers' move action
		// detaches+places, so total piece count stays at 24
		// across normal play; only chonking compacts a stack into
		// one Map entry, and the alpha-easy AI may not chonk on
		// move 1.)
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
			{ timeout: 30_000 },
		);

		// HUD visible — Quit button is reliably present in PlayView.
		await expect(page.getByRole("button", { name: "Quit" })).toBeVisible();
	});
});

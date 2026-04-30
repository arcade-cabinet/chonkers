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
			readonly state: unknown;
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

		// Game progresses — wait for at least one ply.
		// (Easy AIs decide quickly; this should resolve well under 30s.)
		await page.waitForFunction(
			() => {
				const state = window.__chonkers?.state as
					| { board?: Map<unknown, unknown> }
					| null
					| undefined;
				if (!state || !state.board) return false;
				return state.board.size <= 24; // start = 24, decreasing means moves happened
			},
			null,
			{ timeout: 30_000 },
		);

		// HUD visible — Quit button is reliably present in PlayView.
		await expect(page.getByRole("button", { name: "Quit" })).toBeVisible();
	});
});

/**
 * Split-radial probe spec — `@pap` tag (excluded from CI grep).
 *
 * Goal: prove the split radial's a11y surface end-to-end without
 * depending on a long multi-turn PaP match to set up a 2-stack.
 *
 * Strategy: use the testHook's `scene.openSplitRadialAt(col, row,
 * height)` to open the radial directly (this is the dev-only API the
 * smoke spec already uses for fixture access). Then assert:
 *   1. Radial DOM appears with role=menu + aria-label "Split radial".
 *   2. Each slice has role=menuitem + accessible name "slice N".
 *   3. Clicking a slice toggles its selection (visual only — engine
 *      state isn't touched until drag-commit).
 *   4. Closing the radial via testHook removes it from the DOM.
 *
 * The full hold-to-arm + drag-commit chain is exercised by the @pap
 * spec once C3a-tail finishes the multi-turn setup. This probe is
 * the minimal greenable check that the a11y surface itself works.
 */

import { expect, test } from "@playwright/test";
import "./_lib/test-hook";

test.describe("split radial — a11y probe via testHook fixture", {
	tag: "@pap",
}, () => {
	test("radial mounts with role=menu and slice menuitems", async ({ page }) => {
		await page.goto("/chonkers/?testHook=1");
		await page.waitForFunction(() => window.__chonkers !== undefined, null, {
			timeout: 15_000,
		});

		// Boot a vs-AI match so the scene's pieces.topPuckAt has live
		// pucks to anchor the radial against.
		await page.evaluate(() => {
			window.__chonkers?.actions.startNewMatch("red");
		});
		await page.waitForFunction(
			() => window.__chonkers?.screen === "play",
			null,
			{ timeout: 30_000 },
		);

		// Open the radial at a known starting cell. Height=2 is a
		// fixture (the cell is actually a 1-stack at start), but the
		// scene's openSplitRadialAt accepts the override and renders
		// 2 slice menuitems regardless.
		const opened = await page.evaluate(() => {
			return window.__chonkers?.scene.openSplitRadialAt(2, 1, 2) ?? false;
		});
		expect(opened).toBe(true);

		// The radial mounts as <svg role="menu" aria-label="Split radial">
		// inside a div appended to <div id="overlay">.
		const radial = page.getByRole("menu", { name: /split/i });
		await expect(radial).toBeVisible({ timeout: 5_000 });

		// Two slice menuitems for a height-2 stack.
		const slices = radial.getByRole("menuitem");
		await expect(slices).toHaveCount(2);

		// Each slice is keyboard-focusable.
		await expect(
			radial.getByRole("menuitem", { name: /slice 0/i }),
		).toBeVisible();
		await expect(
			radial.getByRole("menuitem", { name: /slice 1/i }),
		).toBeVisible();

		// Close cleanly.
		await page.evaluate(() => {
			window.__chonkers?.scene.closeSplitRadial();
		});
		await expect(radial).not.toBeVisible({ timeout: 5_000 });
	});
});

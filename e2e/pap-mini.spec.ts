/**
 * PaP-mini — `@pap` tag.
 *
 * Smaller hotseat probe that proves the broker-routed
 * commitHumanAction path works end-to-end through real DOM clicks
 * on the a11y board grid. PRQ-C3a-tail.
 *
 * Two turns are enough to verify:
 *   - Lobby → New Game → Pass and Play opens a hotseat match.
 *   - First-mover's tap-select-and-commit advances ply 0 → 1, flips
 *     state.turn.
 *   - Pivot drag (canvas drag from outside cells, OR no-op if state
 *     already advanced via commit's logical flip) doesn't break
 *     anything.
 *   - Second-mover's tap-select-and-commit advances ply 1 → 2.
 *
 * The full multi-turn @pap spec extends this with chonk + split-
 * radial flow; this spec is the minimal "engine moves through the
 * UI" assertion.
 */

import { expect, type Page, test } from "@playwright/test";
import "./_lib/test-hook";

function cellLabel(col: number, row: number): string {
	return `row ${row}, column ${col}`;
}

async function clickCell(page: Page, col: number, row: number): Promise<void> {
	await page
		.getByRole("gridcell", { name: cellLabel(col, row), exact: true })
		.click();
}

async function pivotEndTurn(page: Page): Promise<void> {
	const cell = page.getByRole("gridcell", {
		name: cellLabel(4, 5),
		exact: true,
	});
	const box = await cell.boundingBox();
	if (!box) throw new Error("centre cell missing");
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	// Drag DOWNWARD on screen — PaP's humanFacingColor is pinned to
	// red, so input.ts's onPointerMove expects dy positive.
	await page.mouse.move(x, y + 100, { steps: 8 });
	await page.mouse.move(x, y + 200, { steps: 8 });
	await page.mouse.up();
}

test.describe("PaP mini — broker-routed commit advances ply through real DOM", {
	tag: "@pap",
}, () => {
	test.setTimeout(2 * 60 * 1000);

	test("two human turns advance ply 0 → 1 → 2", async ({ page }) => {
		await page.goto("/chonkers/?testHook=1");
		await page.waitForFunction(() => window.__chonkers !== undefined, null, {
			timeout: 15_000,
		});

		// Open New Game → Pass and Play via the real lobby.
		await page
			.getByRole("dialog", { name: /chonkers/i })
			.waitFor({ state: "visible", timeout: 10_000 });
		await page
			.getByRole("dialog", { name: /chonkers/i })
			.getByRole("button", { name: /^new game$/i })
			.click();
		await page
			.getByRole("dialog", { name: /new game/i })
			.getByRole("button", { name: /^pass and play/i })
			.click();
		await page.waitForFunction(
			() => window.__chonkers?.screen === "play",
			null,
			{ timeout: 30_000 },
		);

		const dumpState = async () =>
			await page.evaluate(() => {
				const h = window.__chonkers;
				return { turn: h?.turn, ply: h?.plyCount };
			});

		const start = await dumpState();
		expect(start.ply).toBe(0);
		const t1: "red" | "white" = start.turn ?? "red";
		const t2 = t1 === "red" ? "white" : "red";

		// Turn 1: t1 advances col=3 from row 3 (if red) or row 7 (if
		// white) by one row toward the opposite home.
		const t1From = t1 === "red" ? { c: 3, r: 3 } : { c: 3, r: 7 };
		const t1To = t1 === "red" ? { c: 3, r: 4 } : { c: 3, r: 6 };
		await clickCell(page, t1From.c, t1From.r);
		await clickCell(page, t1To.c, t1To.r);
		await pivotEndTurn(page);
		const after1 = await dumpState();
		expect(after1.ply).toBe(1);
		expect(after1.turn).toBe(t2);

		// Turn 2: t2 plays a mirror move.
		const t2From = t2 === "red" ? { c: 3, r: 3 } : { c: 3, r: 7 };
		const t2To = t2 === "red" ? { c: 3, r: 4 } : { c: 3, r: 6 };
		await clickCell(page, t2From.c, t2From.r);
		await clickCell(page, t2To.c, t2To.r);
		await pivotEndTurn(page);
		const after2 = await dumpState();
		expect(after2.ply).toBe(2);
		expect(after2.turn).toBe(t1);
	});
});

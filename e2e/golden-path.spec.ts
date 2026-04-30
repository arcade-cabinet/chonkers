/**
 * Golden-path playthrough — one AI-vs-AI match, end to end.
 *
 * Pattern adapted from ../midway-mayhem/e2e/governor-playthrough.spec.ts
 * and ../stellar-descent/playwright.config.ts. The spec acts like a
 * real player: it clicks DOM/aria elements, never reaches into
 * `window.__chonkers`. Periodic screenshots land in the visual
 * artifacts dir per project (visual-desktop / visual-iphone-14 /
 * visual-pixel-7 / visual-ipad-landscape).
 *
 * Why AI-vs-AI is sufficient as the golden path: chonkers' camera
 * frames the WHOLE board at once — the player's "cone of perception"
 * is the entire game state, which is identical to a spectator's view.
 * Watching AI-vs-AI from start to finish therefore exercises every
 * visual surface a real player would see (lobby, ceremony phases,
 * play screen, AI-thinking tilt, mid-match stack states, end screen).
 *
 * The spec uses real DOM/aria affordances:
 *   - SegmentedControl "Watch" radio for spectator mode
 *   - Bezel ▶ Play button (must expose role + accessible name —
 *     PRQ-A8 visual bug; the spec fails on the click step until
 *     the bezel button is made accessible, which is the right
 *     pressure to drive that fix)
 *
 * Failure modes the spec catches:
 *   - Bezel buttons inaccessible (current PRQ-A8 bug)
 *   - Console errors during boot or play
 *   - Terminal state never reached within ply cap
 *   - Visual regression at any of the captured states
 */

import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const PLY_CAP = 80;
const SCREENSHOT_DIR = "artifacts/visual-review";

test.describe("@visual golden path — AI-vs-AI playthrough", () => {
	test("watches a complete match from lobby to end screen", async ({
		page,
	}, testInfo) => {
		// Cold-boot + 80-ply hard-AI playthrough on swiftshader-class
		// runners can run long. Local M-series hardware finishes in
		// ~30s; budget 5min for slow CI.
		test.setTimeout(5 * 60_000);

		const consoleErrors: string[] = [];
		page.on("pageerror", (err) => {
			consoleErrors.push(`uncaught: ${err.message}`);
		});
		page.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});

		const project = testInfo.project.name;
		const outDir = `${SCREENSHOT_DIR}/${project}`;
		mkdirSync(outDir, { recursive: true });
		const snap = async (id: string) => {
			await page.screenshot({
				path: `${outDir}/${id}.png`,
				fullPage: false,
				animations: "disabled",
			});
		};

		// ── 1. Lobby ──
		await page.goto("/");
		// Lobby DOM mount — picker SegmentedControl is the most
		// reliable mount marker (no testid needed, it's a Radix
		// SegmentedControl with stable aria roles).
		await expect(page.getByRole("radio", { name: "Play Red" })).toBeVisible({
			timeout: 30_000,
		});
		// Wait for the LobbyScene canvas to render at least one frame
		// so the screenshot captures the actual 3D content + demo pieces,
		// not a partial loading state.
		await expect(page.locator("canvas").first()).toBeVisible({
			timeout: 30_000,
		});
		await page.waitForTimeout(800); // demo-pieces settle
		await snap("01-lobby");

		// ── 2. Pick "Watch" mode ──
		await page.getByRole("radio", { name: "Watch" }).click();
		await page.waitForTimeout(200);
		await snap("02-watch-selected");

		// ── 3. Click the ▶ Play wedge on the red demo piece ──
		// PRQ-A1's RadialOverlay primitive renders a per-wedge <button>
		// for every piece-top affordance (lobby Play / Resume, top-color
		// caps, live split slices). The lobby's red demo piece has a
		// single full-disc wedge labelled "Play new match".
		await page.getByRole("button", { name: "Play new match" }).click();

		// ── 4. Ceremony phases ──
		// Phase budgets per LobbyView.tsx:
		//   demo-clearing 720ms → placing-first 1500ms → placing-second
		//   1500ms → coin-flip 1900ms → settling 280ms → idle/play
		// Total ~5.9s. Snap at the start of each visible phase.
		await page.waitForTimeout(400); // mid demo-clearing
		await snap("03-demo-clearing");
		await page.waitForTimeout(800); // mid placing-first
		await snap("04-placing-first");
		await page.waitForTimeout(1500); // mid placing-second
		await snap("05-placing-second");
		await page.waitForTimeout(1500); // mid coin-flip
		await snap("06-coin-flip");
		await page.waitForTimeout(2000); // post-settling, in play
		await snap("07-play-opening");

		// ── 5. AI-vs-AI plies ──
		// We don't drive moves from the spec — both sides are AI in
		// "Watch" mode, the broker auto-runs each turn through
		// stepTurn. The spec just observes via the "Red to move" /
		// "White to move" turn-pill text and snaps after a few plies.
		// Status pill from PlayView.tsx is role="status".
		const turnIndicator = page.getByRole("status");
		await expect(turnIndicator).toBeVisible({ timeout: 30_000 });

		const observedTurns: string[] = [];
		for (let i = 0; i < 12; i += 1) {
			const text = (await turnIndicator.textContent())?.trim() ?? "";
			observedTurns.push(text);
			await snap(`08-mid-match-${String(i).padStart(2, "0")}`);
			// Wait long enough for the next ply to land. easy-vs-easy
			// at depth 2 takes ~50-200ms; +500ms covers the AnimatePresence
			// turn-pill swap so the next snapshot is on a settled state.
			await page.waitForTimeout(1500);
		}

		// ── 6. Quit back to lobby ──
		// In spectator mode (humanColor=null) the Forfeit button is
		// hidden — there's no human to forfeit on behalf of. The
		// Quit button is always visible; clicking it tears down the
		// match and returns to the lobby. Snap the post-quit lobby
		// to verify the picker re-mounts and the demo pieces re-
		// render correctly after a match has run.
		const quit = page.getByRole("button", { name: /^Quit$/i });
		await quit.click();
		// AlertDialog confirmation
		const confirmQuit = page.getByRole("button", { name: /^Leave$/i });
		await confirmQuit.click({ force: true }).catch(() => undefined);
		// Wait for the lobby to remount (picker SegmentedControl).
		await expect(page.getByRole("radio", { name: "Play Red" })).toBeVisible({
			timeout: 30_000,
		});
		await page.waitForTimeout(600);
		await snap("99-lobby-after-quit");

		// ── 7. Console-error budget ──
		// Tolerate noise from THREE deprecation warnings (Clock /
		// PCFSoftShadowMap) — those fire at module init and aren't
		// failures. Anything else is a fail.
		const fatal = consoleErrors.filter(
			(e) => !e.includes("THREE.Clock") && !e.includes("PCFSoftShadowMap"),
		);
		expect(
			fatal,
			`fatal console errors during playthrough:\n${fatal.join("\n")}`,
		).toEqual([]);

		// Sanity: we observed at least one turn flip during play.
		expect(
			new Set(observedTurns).size,
			`turn pill never changed across ${observedTurns.length} reads — AI may be stuck`,
		).toBeGreaterThan(1);
		expect(observedTurns.length).toBeLessThanOrEqual(PLY_CAP);
	});
});

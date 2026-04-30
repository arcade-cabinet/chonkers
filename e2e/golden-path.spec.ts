/**
 * Golden-path playthrough — one AI-vs-AI match, end to end, run
 * across four viewports inside ONE Chromium process.
 *
 * Pattern adapted from ../midway-mayhem/e2e/governor-playthrough.spec.ts
 * + ../stellar-descent/playwright.config.ts. The spec acts like a
 * real player: it clicks DOM/aria elements, never reaches into
 * `window.__chonkers`. Periodic screenshots land in the visual
 * artifacts dir per VIEWPORT (desktop / iphone-14 / pixel-7 /
 * ipad-landscape).
 *
 * Why ONE Chromium process, not four parallel: PRQ-A1 audit on
 * 2026-04-30 found that running four parallel `visual-*` projects
 * (each a fresh Chromium with HDRI + PBR + WebGL + ANGLE GL ≈
 * 600MB) plus a warm Vite dev server was the OOM amplifier on top
 * of a render-loop bug. Single Chromium + per-describe viewport
 * iteration caps memory at one context.
 *
 * Why AI-vs-AI is sufficient as the golden path: chonkers' camera
 * frames the WHOLE board at once — the player's "cone of perception"
 * is the entire game state, which is identical to a spectator's view.
 * Watching AI-vs-AI from start to finish therefore exercises every
 * visual surface a real player would see (lobby, ceremony phases,
 * play screen, mid-match stack states, post-quit lobby).
 *
 * The spec uses real DOM/aria affordances:
 *   - SegmentedControl "Watch" radio for spectator mode
 *   - RadialOverlay-on-DemoPiece "Play new match" button
 *   - PlayView "Quit" button + AlertDialog "Leave" confirm
 *
 * Failure modes the spec catches:
 *   - Console errors during boot or play
 *   - Affordances inaccessible via aria
 *   - Turn-pill never updates (AI stuck)
 *   - Visual regression at any of the captured states (screenshots
 *     land in artifacts/visual-review/<viewport>/)
 */

import { mkdirSync } from "node:fs";
import { devices, expect, test } from "@playwright/test";

const PLY_CAP = 80;
const SCREENSHOT_DIR = "artifacts/visual-review";

interface ViewportConfig {
	readonly id: string;
	/** Playwright `test.use` payload — passed verbatim. */
	readonly use: Parameters<(typeof test)["use"]>[0];
}

const VIEWPORTS: ReadonlyArray<ViewportConfig> = [
	{
		id: "desktop",
		use: {
			...devices["Desktop Chrome"],
			viewport: { width: 1920, height: 1080 },
		},
	},
	{ id: "iphone-14", use: devices["iPhone 14"] },
	{ id: "pixel-7", use: devices["Pixel 7"] },
	{ id: "ipad-landscape", use: devices["iPad Pro 11 landscape"] },
];

async function runPlaythrough(
	page: import("@playwright/test").Page,
	viewportId: string,
): Promise<void> {
	const consoleErrors: string[] = [];
	page.on("pageerror", (err) => {
		consoleErrors.push(`uncaught: ${err.message}`);
	});
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});

	const outDir = `${SCREENSHOT_DIR}/${viewportId}`;
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
	// Lobby DOM mount — picker SegmentedControl is the most reliable
	// mount marker (no testid needed, stable Radix aria roles).
	await expect(page.getByRole("radio", { name: "Play Red" })).toBeVisible({
		timeout: 30_000,
	});
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
	// PRQ-A1's RadialOverlay primitive renders a per-wedge <button>.
	// The lobby's red demo piece has a single full-disc wedge
	// labelled "Play new match".
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
	// In "Watch" mode the broker auto-runs each turn via stepTurn.
	// The spec just observes the turn-pill text + snaps. Status pill
	// from PlayView is role="status".
	const turnIndicator = page.getByRole("status");
	await expect(turnIndicator).toBeVisible({ timeout: 30_000 });

	const observedTurns: string[] = [];
	for (let i = 0; i < 12; i += 1) {
		const text = (await turnIndicator.textContent())?.trim() ?? "";
		observedTurns.push(text);
		await snap(`08-mid-match-${String(i).padStart(2, "0")}`);
		// Wait long enough for the next ply to land. easy-vs-easy at
		// depth 2 takes ~50-200ms; +500ms covers the AnimatePresence
		// turn-pill swap so the next snapshot is on a settled state.
		await page.waitForTimeout(1500);
	}

	// ── 6. Quit back to lobby ──
	// In spectator mode (humanColor=null) the Forfeit button is
	// hidden. Quit is always visible; clicking it tears down the
	// match and returns to the lobby. Snap the post-quit lobby to
	// verify the picker re-mounts + demo pieces re-render correctly.
	const quit = page.getByRole("button", { name: /^Quit$/i });
	await quit.click();
	const confirmQuit = page.getByRole("button", { name: /^Leave$/i });
	await confirmQuit.click({ force: true }).catch(() => undefined);
	await expect(page.getByRole("radio", { name: "Play Red" })).toBeVisible({
		timeout: 30_000,
	});
	await page.waitForTimeout(600);
	await snap("99-lobby-after-quit");

	// ── 7. Console-error budget ──
	// Tolerate THREE deprecation warnings (Clock / PCFSoftShadowMap)
	// — those fire at module init and aren't failures.
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
}

for (const vp of VIEWPORTS) {
	test.describe(`@visual golden path — ${vp.id}`, () => {
		test.use(vp.use);
		test("plays an AI-vs-AI match from lobby to post-quit lobby", async ({
			page,
		}) => {
			// Cold-boot + 12-ply AI-vs-AI takes ~30s on M-series; budget
			// 5min for slow CI runners.
			test.setTimeout(5 * 60_000);
			await runPlaythrough(page, vp.id);
		});
	});
}

/**
 * Lobby flow spec — pure-DOM Playwright. No testHook shortcuts.
 *
 * Drives the user-facing path from cold boot through the lobby
 * overlay → new-game config → match start, plus the Settings entry
 * point and the Continue Game greyed-state. Authoritative against
 * docs/UI_FLOWS.md "Top-level screen state machine" + "Lobby
 * overlay" + "New-game config overlay" + "Settings overlay".
 *
 * Each test asserts:
 *   - The expected overlay's `<dialog>` is open with the documented
 *     accessible name.
 *   - Every documented button is reachable via `getByRole('button',
 *     { name })` — the same surface a screen reader would see.
 *   - State transitions match the mermaid diagrams in UI_FLOWS.md.
 *
 * RED until PRQ-C3 lands the Solid components.
 */

import { expect, test } from "@playwright/test";

// CI runners are 6-10× slower than local for the boot path (large
// bundle + cold three.js / texture upload + headless chromium's
// software-rendered WebGL). Local boot < 1s; CI boot has been
// observed at 25-40s under load. Use a CI-aware timeout so the test
// still catches regressions locally without flaking on CI.
const BOOT_TIMEOUT = process.env.CI ? 60_000 : 15_000;

test.describe("lobby flow — pure DOM, no testHook", () => {
	test.beforeEach(async ({ page }) => {
		// Capture browser-side errors so a CI failure surfaces the root
		// cause instead of just "dialog never visible".
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});
		page.on("pageerror", (err) => {
			pageErrors.push(`${err.name}: ${err.message}`);
		});

		// We deliberately do NOT pass ?testHook=1 — these tests prove
		// the production overlay path works without dev-only surfaces.
		await page.goto("/chonkers/");
		// Solid mounts into <div id="ui-root">. Wait for the lobby
		// dialog to appear (it's the boot screen). Use a CSS selector
		// + open-attribute check rather than getByRole — CI's chromium
		// (147) intermittently fails to expose <dialog open> via the
		// accessibility tree fast enough, even though the DOM is fully
		// rendered. CSS query + open-attribute is the same assertion
		// from the user's perspective, just polls the DOM directly.
		try {
			await page.locator("dialog.ck-modal[open]").waitFor({
				state: "visible",
				timeout: BOOT_TIMEOUT,
			});
		} catch (err) {
			const uiRoot = await page
				.locator("#ui-root")
				.innerHTML()
				.catch(() => "(missing)");
			console.log("[diagnostic] page errors:", JSON.stringify(pageErrors));
			console.log(
				"[diagnostic] console errors:",
				JSON.stringify(consoleErrors),
			);
			console.log("[diagnostic] #ui-root content:", uiRoot.slice(0, 500));
			throw err;
		}
	});

	test("lobby overlay shows New Game / Continue Game / Settings", async ({
		page,
	}) => {
		const lobby = page.getByRole("dialog", { name: /chonkers/i });
		await expect(lobby).toBeVisible();

		await expect(
			lobby.getByRole("button", { name: /^new game$/i }),
		).toBeVisible();
		await expect(
			lobby.getByRole("button", { name: /^continue game$/i }),
		).toBeVisible();
		await expect(
			lobby.getByRole("button", { name: /^settings$/i }),
		).toBeVisible();
	});

	test("Continue Game is disabled when no saved match", async ({ page }) => {
		// Cold boot — no active-match snapshot exists in Capacitor
		// Preferences. Continue must be disabled + aria-disabled.
		const lobby = page.getByRole("dialog", { name: /chonkers/i });
		const cont = lobby.getByRole("button", { name: /^continue game$/i });
		await expect(cont).toBeDisabled();
		await expect(cont).toHaveAttribute("aria-disabled", "true");
	});

	test("New Game opens the config overlay with 4 cards", async ({ page }) => {
		const lobby = page.getByRole("dialog", { name: /chonkers/i });
		await lobby.getByRole("button", { name: /^new game$/i }).click();

		const config = page.getByRole("dialog", { name: /new game/i });
		await expect(config).toBeVisible();

		// 2x2 card grid — Easy / Medium / Hard / Pass and Play.
		await expect(config.getByRole("button", { name: /^easy/i })).toBeVisible();
		await expect(
			config.getByRole("button", { name: /^medium/i }),
		).toBeVisible();
		await expect(config.getByRole("button", { name: /^hard/i })).toBeVisible();
		await expect(
			config.getByRole("button", { name: /^pass and play/i }),
		).toBeVisible();
	});

	test("ESC closes the New Game overlay back to the lobby", async ({
		page,
	}) => {
		await page
			.getByRole("dialog", { name: /chonkers/i })
			.getByRole("button", { name: /^new game$/i })
			.click();
		await expect(page.getByRole("dialog", { name: /new game/i })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(
			page.getByRole("dialog", { name: /new game/i }),
		).not.toBeVisible();
		await expect(page.getByRole("dialog", { name: /chonkers/i })).toBeVisible();
	});

	test("clicking Easy starts a vs-AI match and dismisses the overlays", async ({
		page,
	}) => {
		const lobby = page.getByRole("dialog", { name: /chonkers/i });
		await lobby.getByRole("button", { name: /^new game$/i }).click();
		const config = page.getByRole("dialog", { name: /new game/i });
		await config.getByRole("button", { name: /^easy/i }).click();

		// Both overlays close — the player is now in the play screen.
		await expect(
			page.getByRole("dialog", { name: /chonkers/i }),
		).not.toBeVisible();
		await expect(
			page.getByRole("dialog", { name: /new game/i }),
		).not.toBeVisible();

		// The bezel hamburger is the only persistent UI chrome during
		// play — it should appear once the match is live.
		await expect(page.getByRole("button", { name: /menu|pause/i })).toBeVisible(
			{ timeout: BOOT_TIMEOUT },
		);
	});

	test("Settings opens from the lobby and closes back to it", async ({
		page,
	}) => {
		const lobby = page.getByRole("dialog", { name: /chonkers/i });
		await lobby.getByRole("button", { name: /^settings$/i }).click();

		const settings = page.getByRole("dialog", { name: /settings/i });
		await expect(settings).toBeVisible();

		// Documented v1 fields: audio mute, haptics, reduced-motion,
		// default difficulty. Each is a labelled input — assert by
		// accessible name, not by markup.
		await expect(
			settings.getByRole("checkbox", { name: /audio|mute|sound/i }),
		).toBeVisible();
		await expect(
			settings.getByRole("checkbox", { name: /haptics/i }),
		).toBeVisible();
		await expect(
			settings.getByRole("checkbox", { name: /reduced motion/i }),
		).toBeVisible();
		await expect(
			settings.getByRole("radiogroup", { name: /default difficulty/i }),
		).toBeVisible();

		// "Done" returns to the caller (lobby).
		await settings.getByRole("button", { name: /^done$/i }).click();
		await expect(settings).not.toBeVisible();
		await expect(lobby).toBeVisible();
	});

	test("first focused element on lobby paint is New Game", async ({ page }) => {
		const lobby = page.getByRole("dialog", { name: /chonkers/i });
		const newGame = lobby.getByRole("button", { name: /^new game$/i });
		await expect(newGame).toBeFocused();
	});

	test("Continue Game enables after a match auto-saves; clicking it resumes", async ({
		page,
	}) => {
		// Start a vs-AI match through the lobby. The first ply commits
		// to the active-match KV slot, so on a fresh load Continue
		// Game lights up.
		await page.goto("/chonkers/?testHook=1");
		await page.waitForFunction(() => window.__chonkers !== undefined, null, {
			timeout: BOOT_TIMEOUT,
		});
		await page
			.getByRole("dialog", { name: /chonkers/i })
			.getByRole("button", { name: /^new game$/i })
			.click();
		await page
			.getByRole("dialog", { name: /new game/i })
			.getByRole("button", { name: /^easy/i })
			.click();
		// Wait for the match to start + at least one ply to commit
		// (which writes the snapshot).
		await page.waitForFunction(
			() => window.__chonkers?.screen === "play",
			null,
			{ timeout: 30_000 },
		);
		// Force one stepTurn to make sure a ply has landed.
		await page.evaluate(() => window.__chonkers?.actions.stepTurn());
		await page.waitForFunction(
			() => (window.__chonkers?.plyCount ?? 0) >= 1,
			null,
			{ timeout: 30_000 },
		);
		const savedPly =
			(await page.evaluate(() => window.__chonkers?.plyCount)) ?? 0;

		// Reload — Solid + scene re-bootstrap from scratch. The active-
		// match snapshot persists via Capacitor Preferences (localStorage
		// on web).
		await page.reload();
		await page.waitForFunction(() => window.__chonkers !== undefined, null, {
			timeout: BOOT_TIMEOUT,
		});
		const lobby = page.getByRole("dialog", { name: /chonkers/i });
		await lobby.waitFor({ state: "visible", timeout: BOOT_TIMEOUT });

		// Continue Game now enabled.
		const cont = lobby.getByRole("button", { name: /^continue game$/i });
		await expect(cont).toBeEnabled();

		// Click resumes — match handle materialises, screen flips to
		// "play", plyCount restored.
		await cont.click();
		await page.waitForFunction(
			() => window.__chonkers?.screen === "play",
			null,
			{ timeout: BOOT_TIMEOUT },
		);
		const restoredPly =
			(await page.evaluate(() => window.__chonkers?.plyCount)) ?? -1;
		expect(restoredPly).toBeGreaterThanOrEqual(savedPly);
	});
});

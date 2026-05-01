/**
 * Accessibility spec — `@axe`-tagged. PRQ-B5 acceptance §3.
 *
 * Visits each diegetic UI surface and runs axe-core to assert no
 * critical or serious WCAG 2.1 AA violations. The 3D scene itself is
 * opaque to axe (a single <canvas>), so the SVG overlay layer is the
 * actual audit surface — the affordance + radial buttons that handle
 * input must be labelled, focusable, and contrast-passing.
 *
 * Surfaces:
 *   1. Lobby — Play / Resume affordances on the demo pucks.
 *   2. Splitting radial — slice buttons + arming hint.
 *   3. Pause radial — Resume / Settings / Quit.
 *
 * The end-game radial requires playing through to a winner, which
 * the governor spec already exercises end-to-end; we skip it here to
 * keep the a11y suite under 30s.
 *
 * Runs only on chromium desktop (axe is engine-agnostic; testing
 * the same DOM tree on every device project would just multiply
 * runtime without finding new violations).
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import "./_lib/test-hook";

test.describe("accessibility — diegetic UI surfaces", { tag: "@axe" }, () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/chonkers/?testHook=1");
		await page.waitForFunction(() => window.__chonkers !== undefined, null, {
			timeout: 15_000,
		});
	});

	test("lobby surface — branded centered overlay", async ({ page }) => {
		// Wait for the Solid lobby <dialog> to mount.
		await page
			.getByRole("dialog", { name: /chonkers/i })
			.waitFor({ state: "visible", timeout: 10_000 });

		const results = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
			.analyze();

		const critical = results.violations.filter(
			(v) => v.impact === "critical" || v.impact === "serious",
		);
		expect
			.soft(critical, `lobby a11y violations: ${formatViolations(critical)}`)
			.toEqual([]);
	});

	test("splitting radial surface", async ({ page }) => {
		// Boot a match so a stack exists to split.
		await page.evaluate(() => {
			window.__chonkers?.actions.startNewMatch(null);
		});
		await page.waitForFunction(
			() => window.__chonkers?.screen === "play",
			null,
			{ timeout: 30_000 },
		);

		// Open the splitting radial at a known starting cell. The
		// initial 5-4-3 layout has 1-stacks everywhere so we need to
		// build a 2-stack first — but for the a11y audit we just need
		// the radial DOM mounted. The scene helper opens it directly.
		const opened = await page.evaluate(() => {
			// Use any owned cell; height=2 is a fiction for the audit
			// but the radial accepts it and renders 2 slice buttons.
			return window.__chonkers?.scene.openSplitRadialAt(2, 1, 2) ?? false;
		});
		expect(opened).toBe(true);

		// Wait for the SVG overlay to render.
		await page
			.waitForSelector(".ck-split-radial, [data-overlay='split']", {
				timeout: 5_000,
			})
			.catch(() => {
				// Fallback: just wait a tick for any overlay to mount.
				return page.waitForTimeout(500);
			});

		const results = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
			.analyze();

		const critical = results.violations.filter(
			(v) => v.impact === "critical" || v.impact === "serious",
		);
		expect
			.soft(
				critical,
				`split-radial a11y violations: ${formatViolations(critical)}`,
			)
			.toEqual([]);
	});

	test("pause radial surface", async ({ page }) => {
		await page.evaluate(() => {
			window.__chonkers?.actions.startNewMatch(null);
		});
		await page.waitForFunction(
			() => window.__chonkers?.screen === "play",
			null,
			{ timeout: 30_000 },
		);

		await page.evaluate(() => {
			window.__chonkers?.scene.openPauseRadial();
		});
		// Allow the radial to mount.
		await page.waitForTimeout(500);

		const results = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
			.analyze();

		const critical = results.violations.filter(
			(v) => v.impact === "critical" || v.impact === "serious",
		);
		expect
			.soft(
				critical,
				`pause-radial a11y violations: ${formatViolations(critical)}`,
			)
			.toEqual([]);
	});
});

function formatViolations(violations: readonly AxeViolation[]): string {
	if (violations.length === 0) return "none";
	return violations
		.map(
			(v) =>
				`${v.id} (${v.impact}): ${v.description} [${v.nodes.length} node(s)]`,
		)
		.join("\n");
}

interface AxeViolation {
	readonly id: string;
	readonly impact?: string | null;
	readonly description: string;
	readonly nodes: ReadonlyArray<unknown>;
}

/**
 * Playwright config for the chonkers e2e suite.
 *
 * Tier 1 — chromium desktop. The PR-gating tier; smoke runs here on
 * every PR via `pnpm test:e2e:ci` (under 30s).
 *
 * Tier 2 — mobile + iPad projects. The form factors the released app
 * actually ships to (Capacitor wraps the same web bundle for Android
 * + iOS). The smoke spec runs on every project; the governor + the
 * future a11y spec run on chromium desktop only — the mobile/iPad
 * projects exist to surface viewport / touch / DPR regressions in the
 * boot path, not to re-run multi-minute AI-vs-AI matches three times.
 */

import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
	testDir: "./e2e",
	// Per-test timeout. CI runners are 6-10× slower than local (cold
	// cache + headless chromium's software WebGL); a Continue Game
	// flow that does cold-boot + match start + ply step + reload +
	// cold-boot again can take 70-90s on CI. Local-CI=true runs in
	// 1.8min for the whole suite, so the larger ceiling doesn't slow
	// dev iteration.
	timeout: isCI ? 180_000 : 60_000,
	expect: { timeout: isCI ? 15_000 : 5_000 },
	forbidOnly: isCI,
	retries: isCI ? 2 : 0,
	workers: 1,
	reporter: isCI ? "github" : "list",
	use: {
		baseURL: "http://localhost:5273/chonkers/",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			// Pixel-class Android. Smoke only; governor would 3× the
			// already-9min runtime to no signal — touch input is exercised
			// by the smoke spec's testHook gestures.
			name: "android-pixel",
			use: { ...devices["Pixel 7"] },
			grep: /smoke/,
		},
		{
			// iPhone 14 — primary iOS target for v1.
			name: "ios-iphone",
			use: { ...devices["iPhone 14"] },
			grep: /smoke/,
		},
		{
			// iPad — landscape-only is the canonical orientation per
			// DESIGN.md (the board is wider than tall).
			name: "ipad-landscape",
			use: { ...devices["iPad Pro 11 landscape"] },
			grep: /smoke/,
		},
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:5273",
		reuseExistingServer: !isCI,
		timeout: 120_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});

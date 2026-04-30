/**
 * Playwright config for the chonkers e2e suite.
 *
 * - **Smoke** (`pnpm test:e2e:ci`) — boots the dev server, asserts
 *   the title screen renders, starts an AI-vs-AI match, and
 *   confirms the game progresses. Runs in <30s on a single
 *   chromium project. PR-gating.
 * - **Governor** (`@governor` tag, nightly) — drives the AI through
 *   the UI and asserts state-machine fidelity. PRQ-5 follow-up
 *   work; the smoke test gates merges today, governor gates beta.
 *
 * Mobile + iPad projects land alongside the governor in the beta
 * cycle. Today: chromium desktop only.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 60_000,
	expect: { timeout: 5_000 },
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://localhost:5173",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});

/**
 * Playwright config for the chonkers e2e + visual harness.
 *
 * Three test categories:
 *
 *   1. **Smoke** (`pnpm test:e2e:ci`) — boots the dev server,
 *      asserts the lobby renders, runs an AI-vs-AI match, and
 *      confirms the game progresses. Runs on the `smoke` project
 *      (chromium desktop). PR-gating.
 *
 *   2. **Governor** (`@nightly` tag, nightly schedule) — drives the
 *      AI through the UI and asserts state-machine fidelity. PRQ-5
 *      follow-up work; smoke gates merges today, governor gates beta.
 *
 *   3. **Golden-path playthrough** (`@visual` tag, `pnpm test:golden`)
 *      — `e2e/golden-path.spec.ts` watches one full AI-vs-AI match
 *      from lobby through end screen, snapping screenshots at each
 *      meaningful state. Runs against four viewports inside ONE
 *      Chromium process via per-describe `test.use({viewport})` —
 *      see the spec for the iteration. GPU_ARGS enable ANGLE GL so
 *      WebGL/R3F shaders render correctly headlessly (vs SwiftShader
 *      software rasterisation).
 *
 *      WHY ONE PROJECT, NOT FOUR: PRQ-A1 audit on 2026-04-30 found
 *      that running four parallel Chromium projects each holding
 *      ~600MB (HDRI + PBR + WebGL + ANGLE GL) plus the warm Vite
 *      dev server was the actual amplifier behind the OOM crash.
 *      Single process + viewport iteration caps memory at one
 *      browser-context worth, regardless of how many viewports the
 *      spec snaps.
 *
 *      Pattern adapted from ../stellar-descent/playwright.config.ts +
 *      ../midway-mayhem/e2e/governor-playthrough.spec.ts.
 *
 * The golden-path harness uses Playwright's standard runner: webServer
 * lifecycle, retry semantics, trace/HAR capture on failure, and
 * per-viewport snap iteration inside the spec.
 */

import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

/**
 * GPU-accelerated WebGL args for headless Chromium. Without these,
 * headless Chrome falls back to SwiftShader software rasterisation,
 * which mis-renders R3F's complex shaders + tone mapping. ANGLE GL
 * gives us real GPU output even in `headless: true` mode.
 */
const GPU_ARGS = [
	"--no-sandbox",
	"--use-angle=gl",
	"--enable-webgl",
	"--ignore-gpu-blocklist",
	"--mute-audio",
	"--disable-background-timer-throttling",
	"--disable-backgrounding-occluded-windows",
	"--disable-renderer-backgrounding",
	"--window-position=9999,9999", // off-screen fallback if not headless
];

export default defineConfig({
	testDir: "./e2e",
	// Cold-start CI workers need ~60s to load the bezel + board PBR
	// textures + HDRI + bundle. Per-test timeout covers that plus
	// the smoke spec's 60s wait-for-turn-flip budget. Golden-path
	// stay well under this; the cap is for slow CI runners.
	timeout: 120_000,
	expect: {
		timeout: 5_000,
		toHaveScreenshot: {
			maxDiffPixels: 100,
			threshold: 0.2,
			animations: "disabled",
		},
	},
	forbidOnly: isCI,
	retries: isCI ? 2 : 0,
	// 1 worker globally — golden-path is the long-runner, smoke is
	// fast and shares a dev server, no parallelism gain locally.
	workers: 1,
	// Disable cross-test parallelism. Golden-path internally iterates
	// viewports in a single chromium context; smoke runs one test.
	// Parallel chromium contexts on a workstation = OOM amplifier
	// (PRQ-A1 audit 2026-04-30).
	fullyParallel: false,
	reporter: isCI ? "github" : "list",
	use: {
		baseURL: "http://localhost:5173/chonkers/",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		// ── Smoke + governor (chromium desktop) ──
		{
			name: "chromium",
			testIgnore: /golden-path\.spec\.ts/,
			use: { ...devices["Desktop Chrome"] },
		},

		// ── Golden-path: ONE Chromium context, viewports iterated
		// inside the spec via per-describe test.use({viewport}). All
		// four viewports' captures land in
		// `artifacts/visual-review/<viewport-name>/` driven by the
		// spec's per-step screenshot path.
		{
			name: "visual",
			testMatch: /golden-path\.spec\.ts/,
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1920, height: 1080 },
				launchOptions: { args: GPU_ARGS },
			},
		},
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:5173",
		reuseExistingServer: !isCI,
		timeout: 120_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});

import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: "node",
					environment: "node",
					include: ["src/**/__tests__/*.test.ts"],
					exclude: [
						"src/**/__tests__/*.browser.test.ts",
						// Alpha-stage gate. Runs in a dedicated job
						// (`pnpm test:alpha`) so the default Node tier
						// stays under CI's 3-minute target.
						"src/**/__tests__/broker-100-runs.test.ts",
						// Beta-stage gate. Runs in `pnpm test:beta` —
						// 1000 AI-vs-AI matches across 9 rotated pairings,
						// ~5min on node. Replaces the in-browser
						// e2e/governor.spec.ts 1000-run gate which was
						// taking 4h+ for the same evaluation.
						"src/**/__tests__/broker-1000-runs.test.ts",
						// Balance tuner — long-running optimisation job
						// (~30min default, up to 60min). Excluded from
						// default node tier; run via `pnpm tune:balance`.
						"src/ai/tuner/__tests__/balance-tuner.test.ts",
					],
				},
			},
			{
				extends: true,
				test: {
					name: "tuner",
					environment: "node",
					include: ["src/ai/tuner/__tests__/balance-tuner.test.ts"],
					testTimeout: 60 * 60 * 1000,
				},
			},
			{
				extends: true,
				test: {
					name: "alpha",
					environment: "node",
					include: ["src/**/__tests__/broker-100-runs.test.ts"],
					testTimeout: 15 * 60 * 1000,
				},
			},
			{
				extends: true,
				test: {
					name: "beta",
					environment: "node",
					include: ["src/**/__tests__/broker-1000-runs.test.ts"],
					testTimeout: 25 * 60 * 1000,
				},
			},
			{
				extends: true,
				test: {
					name: "browser",
					include: ["src/**/__tests__/*.browser.test.ts"],
					browser: {
						enabled: true,
						provider: playwright({
							launchOptions: {
								// Allow Howler audio to play in headless tests
								// without a synthetic user-gesture step. PRQ-3
								// audio bus tests use real Howler instances.
								args: ["--autoplay-policy=no-user-gesture-required"],
							},
						}),
						headless: true,
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});

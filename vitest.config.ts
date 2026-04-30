import path from "node:path";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"@app": path.resolve(__dirname, "app"),
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
						"src/**/__tests__/*.browser.test.{ts,tsx}",
						// Alpha-stage gate. Runs in a dedicated job
						// (`pnpm test:alpha`) so the default Node tier
						// stays under CI's 3-minute target.
						"src/**/__tests__/broker-100-runs.test.ts",
					],
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
					name: "browser",
					include: [
						"src/**/__tests__/*.browser.test.{ts,tsx}",
						"app/**/__tests__/*.browser.test.{ts,tsx}",
					],
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

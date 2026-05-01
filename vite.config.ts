import path from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const isCapacitor = process.env.CAPACITOR === "true";

export default defineConfig({
	root: ".",
	publicDir: path.resolve(__dirname, "public"),
	base: isCapacitor ? "/" : "/chonkers/",
	plugins: [
		// Solid is the menu-overlay universe — confined to app/. The
		// plugin handles JSX → reactive runtime + dev HMR.
		solid(),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"@app": path.resolve(__dirname, "app"),
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		assetsInlineLimit: 0,
		sourcemap: true,
	},
	server: {
		host: true,
		port: 5173,
	},
	preview: {
		host: true,
		port: 4173,
	},
	assetsInclude: ["**/*.exr", "**/*.hdr", "**/*.ttf"],
});

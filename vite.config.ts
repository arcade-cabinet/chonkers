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
	// Chonkers runs on a non-default port so it doesn't collide with
	// sibling arcade-cabinet projects (each runs its own dev server on
	// 5173 by default). 5273 was unclaimed at PRQ time.
	server: {
		host: true,
		port: 5273,
		strictPort: true,
	},
	preview: {
		host: true,
		port: 4273,
		strictPort: true,
	},
	assetsInclude: ["**/*.exr", "**/*.hdr", "**/*.ttf"],
});

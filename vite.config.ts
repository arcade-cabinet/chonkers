import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isCapacitor = process.env.CAPACITOR === "true";

export default defineConfig({
	root: "./app",
	publicDir: path.resolve(__dirname, "public"),
	base: isCapacitor ? "/" : "/chonkers/",
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"@app": path.resolve(__dirname, "app"),
		},
	},
	plugins: [react()],
	build: {
		outDir: "../dist",
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

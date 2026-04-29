#!/usr/bin/env node
/**
 * Copy sql.js WASM binaries from node_modules into public/ + public/assets/.
 *
 * jeep-sqlite (the web shim for @capacitor-community/sqlite) loads
 * sql-wasm.wasm at runtime. Vite serves it from public/, so we copy the
 * file from sql.js's npm dist on every dev/build/test entry.
 *
 * Outputs are gitignored — see .gitignore.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const require = createRequire(import.meta.url);

const files = ["sql-wasm.wasm", "sql-wasm-browser.wasm"];
const targets = [path.join(repoRoot, "public"), path.join(repoRoot, "public", "assets")];

for (const dir of targets) {
	mkdirSync(dir, { recursive: true });
}

let copied = 0;
for (const file of files) {
	let source;
	try {
		source = require.resolve(`sql.js/dist/${file}`);
	} catch (err) {
		// sql-wasm-browser.wasm may not exist on every sql.js release; that's OK.
		if (file === "sql-wasm-browser.wasm") continue;
		throw err;
	}
	for (const dir of targets) {
		copyFileSync(source, path.join(dir, file));
		copied += 1;
	}
}

console.log(`copy-wasm: copied ${copied} file(s) into public/ + public/assets/`);

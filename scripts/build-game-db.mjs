#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Build-time pipeline: produce the chonkers SQLite asset from the
 * committed drizzle migration ladder.
 *
 * jeep-sqlite (the web shim for capacitor-sqlite) auto-discovers
 * databases at `public/assets/databases/databases.json`. Each entry
 * in that JSON points at a file named `<dbname>SQLite.db` in the
 * same directory. capacitor-sqlite's `copyFromAssets()` is what the
 * runtime calls to import the asset on first run — it works with
 * the same asset layout on web AND native (capacitor's `cap sync`
 * copies `public/assets/databases/` into the platform asset dirs).
 *
 * Outputs:
 *   - public/assets/databases/chonkersSQLite.db   the SQLite file
 *   - public/assets/databases/databases.json       discovery manifest
 *   - public/game-db.meta.json                     { user_version, generated_at }
 *
 * All three outputs are gitignored. CI rebuilds on every test/build run.
 *
 * See `docs/DB.md` "Build time" for the full contract.
 */
import BetterSqlite3 from "better-sqlite3";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const drizzleDir = join(repoRoot, "drizzle");
const databasesDir = join(repoRoot, "public", "assets", "databases");
const dbFileName = "chonkersSQLite.db"; // jeep-sqlite naming convention
const dbOut = join(databasesDir, dbFileName);
const manifestOut = join(databasesDir, "databases.json");
const metaOut = join(repoRoot, "public", "game-db.meta.json");

mkdirSync(databasesDir, { recursive: true });

// Discover migration ladder. drizzle-kit emits NNNN_*.sql files.
const migrations = readdirSync(drizzleDir)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();

if (migrations.length === 0) {
	console.error(
		`build-game-db: no migrations found at ${drizzleDir} — has drizzle-kit generate run?`,
	);
	process.exit(1);
}

// Build the DB in memory, then serialise to disk. better-sqlite3's
// `serialize()` returns the on-disk format directly; no intermediate
// VFS or backup-API round-trip required.
const db = new BetterSqlite3(":memory:");
db.pragma("foreign_keys = ON");

for (const file of migrations) {
	const sql = readFileSync(join(drizzleDir, file), "utf8");
	const statements = sql
		.split(/--> statement-breakpoint/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	for (const stmt of statements) db.exec(stmt);
}

const userVersion = migrations.length;
db.pragma(`user_version = ${userVersion}`);

const bytes = db.serialize();
writeFileSync(dbOut, bytes);
db.close();

// jeep-sqlite discovery manifest. capacitor-sqlite's copyFromAssets
// reads this JSON and imports every listed *.db.
writeFileSync(
	manifestOut,
	`${JSON.stringify({ databaseList: [dbFileName] }, null, 2)}\n`,
);

// Meta file consumed by `bootstrap.ts` to compute the replay window.
const meta = {
	user_version: userVersion,
	generated_at: new Date().toISOString(),
};
writeFileSync(metaOut, `${JSON.stringify(meta, null, 2)}\n`);

console.log(
	`build-game-db: wrote ${dbOut} (${bytes.byteLength} bytes, user_version=${userVersion}, ${migrations.length} migration(s))`,
);

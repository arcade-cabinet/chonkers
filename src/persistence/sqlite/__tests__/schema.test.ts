/**
 * Schema-correctness tests against a fresh `makeTestDb()`.
 *
 * These tests assert that:
 *   1. Every table from the catalogue in docs/DB.md exists.
 *   2. Each table's columns match the catalogue (name + nullability).
 *   3. Foreign keys are wired with ON DELETE CASCADE / SET NULL per spec.
 *   4. Indices are present on the columns the catalogue declares them on.
 *   5. PRAGMA user_version reflects the migration count.
 *   6. PRAGMA foreign_keys is ON.
 *
 * The tests do not assert *behaviour* of the schema (CRUD, transactions,
 * etc.) — those live in the repo tests under `src/store/repos/`.
 */

import { describe, expect, it } from "vitest";
import { makeTestDb } from "./test-db";

interface ColumnInfo {
	readonly cid: number;
	readonly name: string;
	readonly type: string;
	readonly notnull: number;
	readonly dflt_value: unknown;
	readonly pk: number;
}

interface IndexInfo {
	readonly seq: number;
	readonly name: string;
	readonly unique: number;
	readonly origin: string;
	readonly partial: number;
}

interface ForeignKeyInfo {
	readonly id: number;
	readonly seq: number;
	readonly table: string;
	readonly from: string;
	readonly to: string;
	readonly on_update: string;
	readonly on_delete: string;
}

function tableColumns(
	sqlDb: ReturnType<typeof makeTestDb>["sqlDb"],
	table: string,
): readonly ColumnInfo[] {
	return sqlDb.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

function tableIndices(
	sqlDb: ReturnType<typeof makeTestDb>["sqlDb"],
	table: string,
): readonly IndexInfo[] {
	return sqlDb.prepare(`PRAGMA index_list(${table})`).all() as IndexInfo[];
}

function tableForeignKeys(
	sqlDb: ReturnType<typeof makeTestDb>["sqlDb"],
	table: string,
): readonly ForeignKeyInfo[] {
	return sqlDb
		.prepare(`PRAGMA foreign_key_list(${table})`)
		.all() as ForeignKeyInfo[];
}

function tableExists(
	sqlDb: ReturnType<typeof makeTestDb>["sqlDb"],
	table: string,
): boolean {
	const row = sqlDb
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
		.get(table);
	return row !== undefined;
}

describe("sqlite schema", () => {
	describe("table presence", () => {
		it("creates every table from docs/DB.md catalogue", () => {
			const { sqlDb } = makeTestDb();
			expect(tableExists(sqlDb, "matches")).toBe(true);
			expect(tableExists(sqlDb, "moves")).toBe(true);
			expect(tableExists(sqlDb, "ai_states")).toBe(true);
			expect(tableExists(sqlDb, "analytics_aggregates")).toBe(true);
		});
	});

	describe("matches", () => {
		it("has every column from the catalogue", () => {
			const { sqlDb } = makeTestDb();
			const cols = tableColumns(sqlDb, "matches").map((c) => c.name);
			expect(cols).toEqual(
				expect.arrayContaining([
					"id",
					"started_at",
					"finished_at",
					"winner",
					"red_profile",
					"white_profile",
					"opening_position_hash",
					"coin_flip_seed",
					"chain_source_col",
					"chain_source_row",
					"chain_remaining_json",
					"ply_count",
				]),
			);
		});

		it("marks the catalogue-required notNull columns as notNull", () => {
			const { sqlDb } = makeTestDb();
			const cols = Object.fromEntries(
				tableColumns(sqlDb, "matches").map((c) => [c.name, c]),
			);
			expect(cols.id?.notnull).toBe(1);
			expect(cols.started_at?.notnull).toBe(1);
			expect(cols.red_profile?.notnull).toBe(1);
			expect(cols.white_profile?.notnull).toBe(1);
			expect(cols.opening_position_hash?.notnull).toBe(1);
			expect(cols.coin_flip_seed?.notnull).toBe(1);
			expect(cols.ply_count?.notnull).toBe(1);
			// Nullable per spec:
			expect(cols.finished_at?.notnull).toBe(0);
			expect(cols.winner?.notnull).toBe(0);
			expect(cols.chain_source_col?.notnull).toBe(0);
			expect(cols.chain_source_row?.notnull).toBe(0);
			expect(cols.chain_remaining_json?.notnull).toBe(0);
		});

		it("declares idx_matches_finished_at and idx_matches_profiles", () => {
			const { sqlDb } = makeTestDb();
			const indexNames = tableIndices(sqlDb, "matches").map((i) => i.name);
			expect(indexNames).toEqual(
				expect.arrayContaining([
					"idx_matches_finished_at",
					"idx_matches_profiles",
				]),
			);
		});
	});

	describe("moves", () => {
		it("has every column from the catalogue", () => {
			const { sqlDb } = makeTestDb();
			const cols = tableColumns(sqlDb, "moves").map((c) => c.name);
			expect(cols).toEqual(
				expect.arrayContaining([
					"match_id",
					"ply",
					"color",
					"from_col",
					"from_row",
					"to_col",
					"to_row",
					"slice_indices_json",
					"stack_height_after",
					"position_hash_after",
					"move_duration_ms",
					"created_at",
				]),
			);
		});

		it("uses (match_id, ply) as the composite primary key", () => {
			const { sqlDb } = makeTestDb();
			const pkCols = tableColumns(sqlDb, "moves")
				.filter((c) => c.pk > 0)
				.sort((a, b) => a.pk - b.pk)
				.map((c) => c.name);
			expect(pkCols).toEqual(["match_id", "ply"]);
		});

		it("cascades match_id from matches via FK ON DELETE CASCADE", () => {
			const { sqlDb } = makeTestDb();
			const fks = tableForeignKeys(sqlDb, "moves");
			const matchFk = fks.find((fk) => fk.table === "matches");
			expect(matchFk).toBeDefined();
			expect(matchFk?.from).toBe("match_id");
			expect(matchFk?.on_delete).toBe("CASCADE");
		});
	});

	describe("ai_states", () => {
		it("uses (match_id, profile_key) as the composite primary key", () => {
			const { sqlDb } = makeTestDb();
			const pkCols = tableColumns(sqlDb, "ai_states")
				.filter((c) => c.pk > 0)
				.sort((a, b) => a.pk - b.pk)
				.map((c) => c.name);
			expect(pkCols).toEqual(["match_id", "profile_key"]);
		});

		it("cascades match_id from matches via FK ON DELETE CASCADE", () => {
			const { sqlDb } = makeTestDb();
			const fks = tableForeignKeys(sqlDb, "ai_states");
			const matchFk = fks.find((fk) => fk.table === "matches");
			expect(matchFk).toBeDefined();
			expect(matchFk?.from).toBe("match_id");
			expect(matchFk?.on_delete).toBe("CASCADE");
		});

		it("declares dump_blob as notNull BLOB", () => {
			const { sqlDb } = makeTestDb();
			const cols = Object.fromEntries(
				tableColumns(sqlDb, "ai_states").map((c) => [c.name, c]),
			);
			expect(cols.dump_blob?.notnull).toBe(1);
			// SQLite normalises type names to upper-case.
			expect(cols.dump_blob?.type.toUpperCase()).toBe("BLOB");
		});
	});

	describe("analytics_aggregates", () => {
		it("uses aggregate_key as the primary key", () => {
			const { sqlDb } = makeTestDb();
			const pkCols = tableColumns(sqlDb, "analytics_aggregates")
				.filter((c) => c.pk > 0)
				.map((c) => c.name);
			expect(pkCols).toEqual(["aggregate_key"]);
		});

		it("FK on last_match_id uses ON DELETE SET NULL", () => {
			const { sqlDb } = makeTestDb();
			const fks = tableForeignKeys(sqlDb, "analytics_aggregates");
			const matchFk = fks.find((fk) => fk.table === "matches");
			expect(matchFk).toBeDefined();
			expect(matchFk?.from).toBe("last_match_id");
			expect(matchFk?.on_delete).toBe("SET NULL");
		});
	});

	describe("pragmas", () => {
		it("PRAGMA user_version equals migrationsApplied", () => {
			const { sqlDb, migrationsApplied } = makeTestDb();
			const userVersion = sqlDb.pragma("user_version", { simple: true });
			expect(userVersion).toBe(migrationsApplied);
		});

		it("PRAGMA foreign_keys is ON", () => {
			const { sqlDb } = makeTestDb();
			const foreignKeys = sqlDb.pragma("foreign_keys", { simple: true });
			expect(foreignKeys).toBe(1);
		});
	});

	describe("FK behaviour", () => {
		it("deleting a matches row cascades to moves and ai_states", () => {
			const { sqlDb } = makeTestDb();
			sqlDb
				.prepare(
					`INSERT INTO matches (id, started_at, red_profile, white_profile, opening_position_hash, coin_flip_seed) VALUES (?, ?, ?, ?, ?, ?)`,
				)
				.run(
					"m1",
					1000,
					"balanced-medium",
					"balanced-medium",
					"hash0",
					"seed0",
				);
			sqlDb
				.prepare(
					`INSERT INTO moves (match_id, ply, color, from_col, from_row, to_col, to_row, stack_height_after, position_hash_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run("m1", 0, "red", 2, 1, 2, 2, 1, "hash1", 1001);
			sqlDb
				.prepare(
					`INSERT INTO ai_states (match_id, profile_key, ply, dump_blob, dump_format_version, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
				)
				.run("m1", "balanced-medium", 0, Buffer.from([1, 2, 3]), 1, 1002);

			sqlDb.prepare(`DELETE FROM matches WHERE id = ?`).run("m1");

			const movesRemaining = sqlDb
				.prepare(`SELECT COUNT(*) as c FROM moves WHERE match_id = ?`)
				.get("m1") as { c: number };
			const aiStatesRemaining = sqlDb
				.prepare(`SELECT COUNT(*) as c FROM ai_states WHERE match_id = ?`)
				.get("m1") as { c: number };
			expect(movesRemaining.c).toBe(0);
			expect(aiStatesRemaining.c).toBe(0);
		});

		it("deleting a matches row sets analytics_aggregates.last_match_id to null", () => {
			const { sqlDb } = makeTestDb();
			sqlDb
				.prepare(
					`INSERT INTO matches (id, started_at, red_profile, white_profile, opening_position_hash, coin_flip_seed) VALUES (?, ?, ?, ?, ?, ?)`,
				)
				.run(
					"m1",
					1000,
					"balanced-medium",
					"balanced-medium",
					"hash0",
					"seed0",
				);
			sqlDb
				.prepare(
					`INSERT INTO analytics_aggregates (aggregate_key, value_json, sample_count, last_match_id, refreshed_at) VALUES (?, ?, ?, ?, ?)`,
				)
				.run("winrate:test", "0.5", 1, "m1", 1001);

			sqlDb.prepare(`DELETE FROM matches WHERE id = ?`).run("m1");

			const row = sqlDb
				.prepare(
					`SELECT last_match_id FROM analytics_aggregates WHERE aggregate_key = ?`,
				)
				.get("winrate:test") as { last_match_id: string | null };
			expect(row.last_match_id).toBeNull();
		});
	});
});

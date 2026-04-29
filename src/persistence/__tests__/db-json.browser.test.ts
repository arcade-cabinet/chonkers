import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence";

import { useIsolatedDb } from "./_setup";

/**
 * SQLite supports JSON natively via json_extract, json_each,
 * json_object, json_array. The persistence package stays generic
 * by simply storing TEXT columns; consumers JSON-encode their
 * shapes and use SQLite's JSON functions to query into them.
 *
 * These tests prove the workflow end-to-end against the same
 * jeep-sqlite/sql.js stack production uses.
 */

describe("db — JSON-column workflow", () => {
	let dbName: string;
	let dbVersion: number;

	beforeEach(async () => {
		({ name: dbName, version: dbVersion } = await useIsolatedDb());
	});

	it("TEXT column round-trips an arbitrary JSON-serializable value", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec(
			"CREATE TABLE blobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
		);

		const original = {
			score: 42,
			tags: ["alpha", "beta"],
			nested: { ok: true, count: 7 },
			nullish: null,
		};
		await conn.exec("INSERT INTO blobs (id, payload) VALUES (?, ?)", [
			"b1",
			JSON.stringify(original),
		]);

		const rows = await conn.query<{ payload: string }>(
			"SELECT payload FROM blobs WHERE id = ?",
			["b1"],
		);
		expect(rows[0]).toBeDefined();
		expect(JSON.parse(rows[0]!.payload)).toEqual(original);
	});

	it("json_extract reads a top-level scalar field", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec(
			"CREATE TABLE blobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
		);
		await conn.exec("INSERT INTO blobs (id, payload) VALUES (?, ?)", [
			"b1",
			JSON.stringify({ score: 42, name: "alpha" }),
		]);

		const rows = await conn.query<{ score: number; name: string }>(
			`SELECT
				json_extract(payload, '$.score') AS score,
				json_extract(payload, '$.name') AS name
			FROM blobs WHERE id = ?`,
			["b1"],
		);
		expect(rows[0]).toEqual({ score: 42, name: "alpha" });
	});

	it("json_extract reads array elements by index", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec(
			"CREATE TABLE blobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
		);
		await conn.exec("INSERT INTO blobs (id, payload) VALUES (?, ?)", [
			"b1",
			JSON.stringify({ tags: ["alpha", "beta", "gamma"] }),
		]);

		const rows = await conn.query<{ first: string; second: string }>(
			`SELECT
				json_extract(payload, '$.tags[0]') AS first,
				json_extract(payload, '$.tags[1]') AS second
			FROM blobs WHERE id = ?`,
			["b1"],
		);
		expect(rows[0]).toEqual({ first: "alpha", second: "beta" });
	});

	it("json_extract reads nested object paths", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec(
			"CREATE TABLE blobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
		);
		await conn.exec("INSERT INTO blobs (id, payload) VALUES (?, ?)", [
			"b1",
			JSON.stringify({
				player: { profile: { name: "alice", level: 8 } },
			}),
		]);

		const rows = await conn.query<{ name: string; level: number }>(
			`SELECT
				json_extract(payload, '$.player.profile.name') AS name,
				json_extract(payload, '$.player.profile.level') AS level
			FROM blobs WHERE id = ?`,
			["b1"],
		);
		expect(rows[0]).toEqual({ name: "alice", level: 8 });
	});

	it("UPDATE of a JSON blob is durable", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec(
			"CREATE TABLE blobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
		);
		await conn.exec("INSERT INTO blobs (id, payload) VALUES (?, ?)", [
			"b1",
			JSON.stringify({ score: 0 }),
		]);

		await conn.exec("UPDATE blobs SET payload = ? WHERE id = ?", [
			JSON.stringify({ score: 100 }),
			"b1",
		]);

		const rows = await conn.query<{ score: number }>(
			`SELECT json_extract(payload, '$.score') AS score FROM blobs WHERE id = ?`,
			["b1"],
		);
		expect(rows[0]?.score).toBe(100);
	});

	it("json_each can iterate array elements", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec(
			"CREATE TABLE blobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
		);
		await conn.exec("INSERT INTO blobs (id, payload) VALUES (?, ?)", [
			"b1",
			JSON.stringify({ tags: ["red", "white", "blue"] }),
		]);

		const rows = await conn.query<{ value: string }>(
			`SELECT json_each.value AS value
			FROM blobs, json_each(blobs.payload, '$.tags')
			WHERE blobs.id = ?
			ORDER BY json_each.key`,
			["b1"],
		);
		expect(rows.map((r) => r.value)).toEqual(["red", "white", "blue"]);
	});
});

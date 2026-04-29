import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence";

import { useIsolatedDb } from "./_setup";

describe("db — exec, query, transaction", () => {
	let dbName: string;
	let dbVersion: number;

	beforeEach(async () => {
		({ name: dbName, version: dbVersion } = await useIsolatedDb());
	});

	it("exec runs DDL — CREATE TABLE round-trips", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");

		// PRAGMA confirms the table exists
		const cols = await conn.query<{ name: string }>("PRAGMA table_info(t)");
		expect(cols.map((c) => c.name).sort()).toEqual(["id", "v"]);
	});

	it("exec + query round-trips DML", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)");
		await conn.exec("INSERT INTO notes (id, body) VALUES (?, ?)", [
			"a",
			"hello",
		]);
		const rows = await conn.query<{ id: string; body: string }>(
			"SELECT id, body FROM notes",
		);
		expect(rows).toEqual([{ id: "a", body: "hello" }]);
	});

	it("UPDATE persists", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)");
		await conn.exec("INSERT INTO notes (id, body) VALUES (?, ?)", [
			"a",
			"before",
		]);
		await conn.exec("UPDATE notes SET body = ? WHERE id = ?", ["after", "a"]);
		const rows = await conn.query<{ body: string }>(
			"SELECT body FROM notes WHERE id = ?",
			["a"],
		);
		expect(rows[0]?.body).toBe("after");
	});

	it("DELETE persists", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec("CREATE TABLE notes (id TEXT PRIMARY KEY)");
		await conn.exec("INSERT INTO notes (id) VALUES (?)", ["a"]);
		await conn.exec("DELETE FROM notes WHERE id = ?", ["a"]);
		const rows = await conn.query("SELECT id FROM notes");
		expect(rows).toEqual([]);
	});

	it("parameter binding prevents SQL injection", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec("CREATE TABLE secrets (id INTEGER PRIMARY KEY, v TEXT)");
		await conn.exec("INSERT INTO secrets (id, v) VALUES (1, 'safe')");

		// Hostile input passed as a parameter must be treated as a literal,
		// not interpreted as SQL. A naive `string + concat` would drop the
		// table; parameter binding does not.
		const evil = "'; DROP TABLE secrets; --";
		await conn.exec("INSERT INTO secrets (id, v) VALUES (?, ?)", [2, evil]);

		const rows = await conn.query<{ id: number; v: string }>(
			"SELECT id, v FROM secrets ORDER BY id",
		);
		expect(rows).toEqual([
			{ id: 1, v: "safe" },
			{ id: 2, v: evil },
		]);
	});

	it("transaction commits on success", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec("CREATE TABLE counter (id INTEGER PRIMARY KEY, n INTEGER)");
		await conn.exec("INSERT INTO counter (id, n) VALUES (1, 0)");

		await conn.transaction(async (tx) => {
			await tx.exec("UPDATE counter SET n = n + 1 WHERE id = 1");
			await tx.exec("UPDATE counter SET n = n + 1 WHERE id = 1");
		});

		const rows = await conn.query<{ n: number }>(
			"SELECT n FROM counter WHERE id = 1",
		);
		expect(rows[0]?.n).toBe(2);
	});

	it("transaction rolls back on throw", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec("CREATE TABLE counter (id INTEGER PRIMARY KEY, n INTEGER)");
		await conn.exec("INSERT INTO counter (id, n) VALUES (1, 0)");

		await expect(
			conn.transaction(async (tx) => {
				await tx.exec("UPDATE counter SET n = n + 100 WHERE id = 1");
				throw new Error("intentional rollback");
			}),
		).rejects.toThrow("intentional rollback");

		const rows = await conn.query<{ n: number }>(
			"SELECT n FROM counter WHERE id = 1",
		);
		expect(rows[0]?.n).toBe(0); // unchanged — rollback succeeded
	});

	it("query returns empty array for empty result set", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await conn.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
		const rows = await conn.query("SELECT id FROM t WHERE id = 999");
		expect(rows).toEqual([]);
	});

	it("invalid SQL surfaces as a thrown error", async () => {
		const conn = await db.connect(dbName, dbVersion);
		await expect(conn.exec("THIS IS NOT VALID SQL")).rejects.toThrow();
	});
});

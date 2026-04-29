import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/persistence";

import { useIsolatedDb } from "./_setup";

describe("db — connection lifecycle", () => {
	let dbName: string;
	let dbVersion: number;

	beforeEach(async () => {
		({ name: dbName, version: dbVersion } = await useIsolatedDb());
	});

	it("exists returns false before connect", async () => {
		expect(await db.exists(dbName)).toBe(false);
	});

	it("exists returns true after connect", async () => {
		await db.connect(dbName, dbVersion);
		expect(await db.exists(dbName)).toBe(true);
	});

	it("connect is idempotent — two calls return usable connections", async () => {
		const a = await db.connect(dbName, dbVersion);
		const b = await db.connect(dbName, dbVersion);
		// Both connections work against the same DB.
		await a.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
		await b.exec("INSERT INTO t (id, v) VALUES (?, ?)", [1, "via-b"]);
		const rows = await a.query<{ id: number; v: string }>("SELECT * FROM t");
		expect(rows).toEqual([{ id: 1, v: "via-b" }]);
	});

	it("close releases the connection — subsequent connect reopens it", async () => {
		const a = await db.connect(dbName, dbVersion);
		await a.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
		await a.exec("INSERT INTO t (id) VALUES (1)");
		await db.close(dbName);

		const reopened = await db.connect(dbName, dbVersion);
		const rows = await reopened.query<{ id: number }>("SELECT id FROM t");
		expect(rows).toEqual([{ id: 1 }]);
	});

	it("two concurrent connections to DIFFERENT names operate independently", async () => {
		const { name: nameA } = await useIsolatedDb();
		const { name: nameB } = await useIsolatedDb();

		const a = await db.connect(nameA, 1);
		const b = await db.connect(nameB, 1);

		await a.exec("CREATE TABLE only_in_a (id INTEGER PRIMARY KEY)");
		await b.exec("CREATE TABLE only_in_b (id INTEGER PRIMARY KEY)");
		await a.exec("INSERT INTO only_in_a VALUES (1)");
		await b.exec("INSERT INTO only_in_b VALUES (2)");

		const rowsA = await a.query<{ id: number }>("SELECT id FROM only_in_a");
		const rowsB = await b.query<{ id: number }>("SELECT id FROM only_in_b");
		expect(rowsA).toEqual([{ id: 1 }]);
		expect(rowsB).toEqual([{ id: 2 }]);

		// Cross-DB query must fail — only_in_a doesn't exist in B.
		await expect(b.query("SELECT id FROM only_in_a")).rejects.toThrow();
	});

	it("foreign keys are enabled automatically on every new connection", async () => {
		const conn = await db.connect(dbName, dbVersion);
		const result = await conn.query<{ foreign_keys: number }>(
			"PRAGMA foreign_keys",
		);
		expect(result[0]?.foreign_keys).toBe(1);
	});
});

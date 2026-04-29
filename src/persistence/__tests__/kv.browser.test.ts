import { Preferences } from "@capacitor/preferences";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kv } from "@/persistence";

import "./_setup";

describe("kv — typed JSON key-value store", () => {
	beforeEach(async () => {
		await Preferences.clear();
	});

	afterEach(async () => {
		await Preferences.clear();
	});

	it("round-trips arbitrary JSON-serializable values via put → get", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc
					.string({ minLength: 1, maxLength: 32 })
					.filter((s) => !s.includes("::")),
				fc.string({ minLength: 1, maxLength: 32 }),
				fc.jsonValue(),
				async (namespace, key, value) => {
					await kv.put(namespace, key, value);
					const got = await kv.get(namespace, key);
					expect(got).toEqual(value);
				},
			),
			{ numRuns: 50 },
		);
	});

	it("returns null for missing keys", async () => {
		expect(await kv.get("nope", "missing")).toBeNull();
	});

	it("remove deletes a key", async () => {
		await kv.put("ns", "k", { a: 1 });
		expect(await kv.get("ns", "k")).toEqual({ a: 1 });
		await kv.remove("ns", "k");
		expect(await kv.get("ns", "k")).toBeNull();
	});

	it("remove on a missing key is a no-op", async () => {
		await kv.remove("ns", "never-existed");
		expect(await kv.get("ns", "never-existed")).toBeNull();
	});

	it("list returns every key+value in a namespace", async () => {
		await kv.put("alpha", "k1", { v: 1 });
		await kv.put("alpha", "k2", { v: 2 });
		await kv.put("alpha", "k3", { v: 3 });
		await kv.put("beta", "other", { v: 99 });

		const alphas = await kv.list<{ v: number }>("alpha");
		expect(alphas).toHaveLength(3);
		expect(alphas.map((e) => e.key).sort()).toEqual(["k1", "k2", "k3"]);
		expect(alphas.map((e) => e.value.v).sort()).toEqual([1, 2, 3]);
	});

	it("list does not bleed across namespaces", async () => {
		await kv.put("alpha", "shared", "alpha-value");
		await kv.put("beta", "shared", "beta-value");

		const alphas = await kv.list<string>("alpha");
		const betas = await kv.list<string>("beta");

		expect(alphas).toEqual([{ key: "shared", value: "alpha-value" }]);
		expect(betas).toEqual([{ key: "shared", value: "beta-value" }]);
	});

	it("clear(namespace) empties one namespace, leaves others intact", async () => {
		await kv.put("alpha", "k1", 1);
		await kv.put("alpha", "k2", 2);
		await kv.put("beta", "kb", 3);

		await kv.clear("alpha");

		expect(await kv.list("alpha")).toEqual([]);
		expect(await kv.get<number>("beta", "kb")).toBe(3);
	});

	it("clear() with no namespace empties everything", async () => {
		await kv.put("alpha", "k1", 1);
		await kv.put("beta", "k2", 2);

		await kv.clear();

		expect(await kv.list("alpha")).toEqual([]);
		expect(await kv.list("beta")).toEqual([]);
	});

	it("corrupted JSON (raw Preferences write) returns null on get", async () => {
		// Bypass the typed wrapper to inject malformed JSON.
		await Preferences.set({ key: "ns::corrupt", value: "{not valid json" });
		expect(await kv.get("ns", "corrupt")).toBeNull();
	});

	it("corrupted JSON entries are skipped in list", async () => {
		await Preferences.set({ key: "ns::corrupt", value: "{not valid" });
		await kv.put("ns", "valid", { ok: true });

		const entries = await kv.list<{ ok: boolean }>("ns");
		expect(entries).toEqual([{ key: "valid", value: { ok: true } }]);
	});

	it("concurrent puts to different keys all complete and round-trip", async () => {
		const N = 25;
		const keys = Array.from({ length: N }, (_, i) => `key-${i}`);
		await Promise.all(keys.map((k, i) => kv.put("concurrent", k, { i })));

		for (const [i, k] of keys.entries()) {
			const got = await kv.get<{ i: number }>("concurrent", k);
			expect(got).toEqual({ i });
		}
	});

	it("namespace::key encoding survives values containing colons", async () => {
		await kv.put("ns", "key:with:colons", { v: "value:with:colons" });
		const got = await kv.get<{ v: string }>("ns", "key:with:colons");
		expect(got).toEqual({ v: "value:with:colons" });
	});

	it("typed put preserves complex shapes (nested objects, arrays, primitives)", async () => {
		const value = {
			nested: { deeper: { key: "yes", count: 42 } },
			tags: ["a", "b", "c"],
			flag: true,
			nullish: null,
		};
		await kv.put("complex", "nested", value);
		expect(await kv.get("complex", "nested")).toEqual(value);
	});
});

import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import { analyticsRepo, matchesRepo } from "@/store";

describe("analyticsRepo", () => {
	describe("upsertAggregate + getAggregate", () => {
		it("inserts a new row with all fields", async () => {
			const { db } = makeTestDb();
			const stored = await analyticsRepo.upsertAggregate(db, {
				aggregateKey: "winrate:aggressive-hard:vs:defensive-hard",
				valueJson: "0.72",
				sampleCount: 50,
			});

			expect(stored.aggregateKey).toBe(
				"winrate:aggressive-hard:vs:defensive-hard",
			);
			expect(stored.valueJson).toBe("0.72");
			expect(stored.sampleCount).toBe(50);
			expect(stored.lastMatchId).toBeNull();
			expect(stored.refreshedAt).toBeGreaterThan(0);
		});

		it("replaces the prior row on conflict", async () => {
			const { db } = makeTestDb();
			await analyticsRepo.upsertAggregate(db, {
				aggregateKey: "winrate:test",
				valueJson: "0.5",
				sampleCount: 10,
			});
			const updated = await analyticsRepo.upsertAggregate(db, {
				aggregateKey: "winrate:test",
				valueJson: "0.7",
				sampleCount: 20,
				refreshedAt: 9999,
			});

			expect(updated.valueJson).toBe("0.7");
			expect(updated.sampleCount).toBe(20);
			expect(updated.refreshedAt).toBe(9999);
		});

		it("references a real match via lastMatchId", async () => {
			const { db } = makeTestDb();
			await matchesRepo.createMatch(db, {
				id: "m1",
				redProfile: "balanced-medium",
				whiteProfile: "balanced-medium",
				openingPositionHash: "hash",
				coinFlipSeed: "seed",
			});
			const stored = await analyticsRepo.upsertAggregate(db, {
				aggregateKey: "avg_ply_count:overall",
				valueJson: "47",
				sampleCount: 1,
				lastMatchId: "m1",
			});
			expect(stored.lastMatchId).toBe("m1");
		});

		it("returns null for missing aggregate key", async () => {
			const { db } = makeTestDb();
			expect(await analyticsRepo.getAggregate(db, "nope")).toBeNull();
		});
	});

	describe("listByFamily", () => {
		it("returns all aggregates whose key starts with the prefix", async () => {
			const { db } = makeTestDb();
			await analyticsRepo.upsertAggregate(db, {
				aggregateKey: "winrate:a",
				valueJson: "0.5",
				sampleCount: 10,
			});
			await analyticsRepo.upsertAggregate(db, {
				aggregateKey: "winrate:b",
				valueJson: "0.6",
				sampleCount: 10,
			});
			await analyticsRepo.upsertAggregate(db, {
				aggregateKey: "avg_ply_count:overall",
				valueJson: "30",
				sampleCount: 1,
			});

			const winrates = await analyticsRepo.listByFamily(db, "winrate:");
			expect(winrates.map((r) => r.aggregateKey).sort()).toEqual([
				"winrate:a",
				"winrate:b",
			]);
		});

		it("returns empty list when no aggregates match", async () => {
			const { db } = makeTestDb();
			expect(await analyticsRepo.listByFamily(db, "nothing:")).toEqual([]);
		});
	});

	describe("FK SET NULL behaviour", () => {
		it("deleting a match nulls last_match_id but preserves the aggregate row", async () => {
			const { db, sqlDb } = makeTestDb();
			await matchesRepo.createMatch(db, {
				id: "m1",
				redProfile: "balanced-medium",
				whiteProfile: "balanced-medium",
				openingPositionHash: "hash",
				coinFlipSeed: "seed",
			});
			await analyticsRepo.upsertAggregate(db, {
				aggregateKey: "winrate:test",
				valueJson: "0.5",
				sampleCount: 10,
				lastMatchId: "m1",
			});

			sqlDb.prepare("DELETE FROM matches WHERE id = ?").run("m1");

			const stored = await analyticsRepo.getAggregate(db, "winrate:test");
			expect(stored).not.toBeNull();
			expect(stored?.lastMatchId).toBeNull();
		});
	});
});

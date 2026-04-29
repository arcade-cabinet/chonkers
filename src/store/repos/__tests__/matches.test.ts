import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import { matchesRepo } from "@/store";

const baseInput = (id: string) => ({
	id,
	redProfile: "balanced-medium",
	whiteProfile: "balanced-medium",
	openingPositionHash: `hash-${id}`,
	coinFlipSeed: `seed-${id}`,
});

describe("matchesRepo", () => {
	describe("createMatch + getMatch", () => {
		it("inserts a row and reads it back with all defaults filled", async () => {
			const { db } = makeTestDb();
			const created = await matchesRepo.createMatch(db, baseInput("m1"));

			expect(created.id).toBe("m1");
			expect(created.redProfile).toBe("balanced-medium");
			expect(created.whiteProfile).toBe("balanced-medium");
			expect(created.openingPositionHash).toBe("hash-m1");
			expect(created.coinFlipSeed).toBe("seed-m1");
			expect(created.finishedAt).toBeNull();
			expect(created.winner).toBeNull();
			expect(created.chainSourceCol).toBeNull();
			expect(created.chainSourceRow).toBeNull();
			expect(created.chainRemainingJson).toBeNull();
			expect(created.plyCount).toBe(0);
			expect(created.startedAt).toBeGreaterThan(0);
		});

		it("uses provided startedAt when supplied", async () => {
			const { db } = makeTestDb();
			const created = await matchesRepo.createMatch(db, {
				...baseInput("m2"),
				startedAt: 1234567890,
			});
			expect(created.startedAt).toBe(1234567890);
		});

		it("returns null for an unknown match id", async () => {
			const { db } = makeTestDb();
			expect(await matchesRepo.getMatch(db, "missing")).toBeNull();
		});
	});

	describe("listMatches", () => {
		it("returns all match rows with finished-at-desc ordering", async () => {
			const { db } = makeTestDb();
			await matchesRepo.createMatch(db, baseInput("m1"));
			await matchesRepo.createMatch(db, baseInput("m2"));
			await matchesRepo.finalizeMatch(db, "m1", "red", 2000);
			await matchesRepo.finalizeMatch(db, "m2", "white", 1000);

			const rows = await matchesRepo.listMatches(db);
			expect(rows.map((r) => r.id)).toEqual(["m1", "m2"]);
		});
	});

	describe("finalizeMatch", () => {
		it("sets winner + finishedAt", async () => {
			const { db } = makeTestDb();
			await matchesRepo.createMatch(db, baseInput("m1"));
			await matchesRepo.finalizeMatch(db, "m1", "red", 5000);

			const row = await matchesRepo.getMatch(db, "m1");
			expect(row?.winner).toBe("red");
			expect(row?.finishedAt).toBe(5000);
		});
	});

	describe("forfeit", () => {
		it("records `forfeit-red` when red gives up", async () => {
			const { db } = makeTestDb();
			await matchesRepo.createMatch(db, baseInput("m1"));
			await matchesRepo.forfeit(db, "m1", "red", 1234);

			const row = await matchesRepo.getMatch(db, "m1");
			expect(row?.winner).toBe("forfeit-red");
			expect(row?.finishedAt).toBe(1234);
		});

		it("records `forfeit-white` when white gives up", async () => {
			const { db } = makeTestDb();
			await matchesRepo.createMatch(db, baseInput("m2"));
			await matchesRepo.forfeit(db, "m2", "white");

			const row = await matchesRepo.getMatch(db, "m2");
			expect(row?.winner).toBe("forfeit-white");
		});
	});

	describe("setChain + clearChain", () => {
		it("sets chain coordinates and remaining JSON", async () => {
			const { db } = makeTestDb();
			await matchesRepo.createMatch(db, baseInput("m1"));
			await matchesRepo.setChain(db, "m1", 4, 2, "[[0],[2]]");

			const row = await matchesRepo.getMatch(db, "m1");
			expect(row?.chainSourceCol).toBe(4);
			expect(row?.chainSourceRow).toBe(2);
			expect(row?.chainRemainingJson).toBe("[[0],[2]]");
		});

		it("clearChain nulls all three columns", async () => {
			const { db } = makeTestDb();
			await matchesRepo.createMatch(db, baseInput("m1"));
			await matchesRepo.setChain(db, "m1", 4, 2, "[[0]]");
			await matchesRepo.clearChain(db, "m1");

			const row = await matchesRepo.getMatch(db, "m1");
			expect(row?.chainSourceCol).toBeNull();
			expect(row?.chainSourceRow).toBeNull();
			expect(row?.chainRemainingJson).toBeNull();
		});
	});

	describe("incrementPly", () => {
		it("increments plyCount by 1", async () => {
			const { db } = makeTestDb();
			await matchesRepo.createMatch(db, baseInput("m1"));
			await matchesRepo.incrementPly(db, "m1");
			await matchesRepo.incrementPly(db, "m1");
			await matchesRepo.incrementPly(db, "m1");

			const row = await matchesRepo.getMatch(db, "m1");
			expect(row?.plyCount).toBe(3);
		});

		it("throws when match does not exist", async () => {
			const { db } = makeTestDb();
			await expect(matchesRepo.incrementPly(db, "ghost")).rejects.toThrow(
				/no match/,
			);
		});
	});
});

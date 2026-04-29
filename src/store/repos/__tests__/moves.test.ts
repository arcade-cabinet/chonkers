import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import { matchesRepo, movesRepo } from "@/store";

async function seedMatch(db: ReturnType<typeof makeTestDb>["db"], id: string) {
	await matchesRepo.createMatch(db, {
		id,
		redProfile: "balanced-medium",
		whiteProfile: "balanced-medium",
		openingPositionHash: `hash-${id}`,
		coinFlipSeed: `seed-${id}`,
	});
}

const baseMoveInput = (matchId: string, ply: number) => ({
	matchId,
	ply,
	color: ply % 2 === 0 ? ("red" as const) : ("white" as const),
	fromCol: 2,
	fromRow: 1,
	toCol: 2,
	toRow: 2,
	stackHeightAfter: 1,
	positionHashAfter: `hash-${matchId}-${ply}`,
});

describe("movesRepo", () => {
	describe("appendMove", () => {
		it("inserts a row and reads it back via getMove", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			const inserted = await movesRepo.appendMove(db, baseMoveInput("m1", 0));

			expect(inserted.matchId).toBe("m1");
			expect(inserted.ply).toBe(0);
			expect(inserted.color).toBe("red");
			expect(inserted.fromCol).toBe(2);
			expect(inserted.toCol).toBe(2);
			expect(inserted.stackHeightAfter).toBe(1);
			expect(inserted.positionHashAfter).toBe("hash-m1-0");
			expect(inserted.sliceIndicesJson).toBeNull();
			expect(inserted.moveDurationMs).toBe(0);
			expect(inserted.createdAt).toBeGreaterThan(0);
		});

		it("stores sliceIndicesJson when provided", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			const inserted = await movesRepo.appendMove(db, {
				...baseMoveInput("m1", 0),
				sliceIndicesJson: "[0,2]",
				moveDurationMs: 250,
			});
			expect(inserted.sliceIndicesJson).toBe("[0,2]");
			expect(inserted.moveDurationMs).toBe(250);
		});

		it("rejects duplicate (matchId, ply) — composite PK collision", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			await movesRepo.appendMove(db, baseMoveInput("m1", 0));
			await expect(
				movesRepo.appendMove(db, baseMoveInput("m1", 0)),
			).rejects.toThrow();
		});
	});

	describe("listMovesByMatch", () => {
		it("returns moves in ascending ply order", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			await movesRepo.appendMove(db, baseMoveInput("m1", 2));
			await movesRepo.appendMove(db, baseMoveInput("m1", 0));
			await movesRepo.appendMove(db, baseMoveInput("m1", 1));

			const list = await movesRepo.listMovesByMatch(db, "m1");
			expect(list.map((m) => m.ply)).toEqual([0, 1, 2]);
		});

		it("returns empty list for a match with no moves", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			expect(await movesRepo.listMovesByMatch(db, "m1")).toEqual([]);
		});
	});

	describe("latestMoveByMatch", () => {
		it("returns the highest-ply move", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			await movesRepo.appendMove(db, baseMoveInput("m1", 0));
			await movesRepo.appendMove(db, baseMoveInput("m1", 1));
			await movesRepo.appendMove(db, baseMoveInput("m1", 2));

			const latest = await movesRepo.latestMoveByMatch(db, "m1");
			expect(latest?.ply).toBe(2);
		});

		it("returns null for a match with no moves", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			expect(await movesRepo.latestMoveByMatch(db, "m1")).toBeNull();
		});
	});

	describe("FK cascade", () => {
		it("deleting a match removes its moves", async () => {
			const { db, sqlDb } = makeTestDb();
			await seedMatch(db, "m1");
			await movesRepo.appendMove(db, baseMoveInput("m1", 0));
			await movesRepo.appendMove(db, baseMoveInput("m1", 1));

			sqlDb.prepare("DELETE FROM matches WHERE id = ?").run("m1");

			expect(await movesRepo.listMovesByMatch(db, "m1")).toEqual([]);
		});
	});
});

import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import { aiStatesRepo, matchesRepo } from "@/store";

async function seedMatch(db: ReturnType<typeof makeTestDb>["db"], id: string) {
	await matchesRepo.createMatch(db, {
		id,
		redProfile: "aggressive-hard",
		whiteProfile: "defensive-hard",
		openingPositionHash: `hash-${id}`,
		coinFlipSeed: `seed-${id}`,
	});
}

describe("aiStatesRepo", () => {
	describe("upsertDump + getDump", () => {
		it("inserts a new row when no prior row exists", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			const blob = new Uint8Array([1, 2, 3, 4, 5]);
			const stored = await aiStatesRepo.upsertDump(db, {
				matchId: "m1",
				profileKey: "aggressive-hard",
				ply: 12,
				dumpBlob: blob,
				dumpFormatVersion: 1,
			});

			expect(stored.matchId).toBe("m1");
			expect(stored.profileKey).toBe("aggressive-hard");
			expect(stored.ply).toBe(12);
			expect(stored.dumpFormatVersion).toBe(1);
			expect(Buffer.from(stored.dumpBlob as Uint8Array).equals(blob)).toBe(
				true,
			);
			expect(stored.createdAt).toBeGreaterThan(0);
		});

		it("replaces the prior row on conflict (replace-not-append)", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			await aiStatesRepo.upsertDump(db, {
				matchId: "m1",
				profileKey: "aggressive-hard",
				ply: 12,
				dumpBlob: new Uint8Array([1]),
				dumpFormatVersion: 1,
			});
			await aiStatesRepo.upsertDump(db, {
				matchId: "m1",
				profileKey: "aggressive-hard",
				ply: 30,
				dumpBlob: new Uint8Array([99, 100]),
				dumpFormatVersion: 1,
			});

			const stored = await aiStatesRepo.getDump(db, "m1", "aggressive-hard");
			expect(stored?.ply).toBe(30);
			expect(
				Buffer.from(stored?.dumpBlob as Uint8Array).equals(
					new Uint8Array([99, 100]),
				),
			).toBe(true);
		});

		it("keeps separate rows for different profile keys on the same match", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			await aiStatesRepo.upsertDump(db, {
				matchId: "m1",
				profileKey: "aggressive-hard",
				ply: 12,
				dumpBlob: new Uint8Array([1]),
				dumpFormatVersion: 1,
			});
			await aiStatesRepo.upsertDump(db, {
				matchId: "m1",
				profileKey: "defensive-hard",
				ply: 12,
				dumpBlob: new Uint8Array([2]),
				dumpFormatVersion: 1,
			});

			const aggro = await aiStatesRepo.getDump(db, "m1", "aggressive-hard");
			const defense = await aiStatesRepo.getDump(db, "m1", "defensive-hard");
			expect(aggro?.dumpBlob).not.toEqual(defense?.dumpBlob);
		});

		it("returns null for missing (matchId, profileKey)", async () => {
			const { db } = makeTestDb();
			await seedMatch(db, "m1");
			expect(await aiStatesRepo.getDump(db, "m1", "balanced-easy")).toBeNull();
			expect(
				await aiStatesRepo.getDump(db, "ghost", "aggressive-hard"),
			).toBeNull();
		});
	});

	describe("FK cascade", () => {
		it("deleting a match removes its ai_states rows", async () => {
			const { db, sqlDb } = makeTestDb();
			await seedMatch(db, "m1");
			await aiStatesRepo.upsertDump(db, {
				matchId: "m1",
				profileKey: "aggressive-hard",
				ply: 12,
				dumpBlob: new Uint8Array([1]),
				dumpFormatVersion: 1,
			});

			sqlDb.prepare("DELETE FROM matches WHERE id = ?").run("m1");

			expect(
				await aiStatesRepo.getDump(db, "m1", "aggressive-hard"),
			).toBeNull();
		});
	});
});

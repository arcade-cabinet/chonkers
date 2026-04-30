import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import { analyticsRepo, matchesRepo } from "@/store";
import { refreshOnMatchEnd } from "..";

async function seedFinishedMatch(
	db: ReturnType<typeof makeTestDb>["db"],
	id: string,
	winner: "red" | "white" | "forfeit-red" | "forfeit-white",
	plyCount = 40,
	red = "balanced-medium",
	white = "balanced-medium",
) {
	await matchesRepo.createMatch(db, {
		id,
		redProfile: red,
		whiteProfile: white,
		openingPositionHash: `hash-${id}`,
		coinFlipSeed: `seed-${id}`,
	});
	for (let i = 0; i < plyCount; i += 1) {
		await matchesRepo.incrementPly(db, id);
	}
	await matchesRepo.finalizeMatch(db, id, winner, 1000 + Number(id.slice(1)));
}

describe("refreshOnMatchEnd", () => {
	it("creates a winrate aggregate after the first match", async () => {
		const { db } = makeTestDb();
		await seedFinishedMatch(db, "m1", "red");
		await refreshOnMatchEnd(db, "m1", 1000);

		const winrate = await analyticsRepo.getAggregate(
			db,
			"winrate:balanced-medium:vs:balanced-medium",
		);
		expect(winrate).not.toBeNull();
		const v = JSON.parse(winrate?.valueJson ?? "{}") as {
			wins_red: number;
			wins_white: number;
			forfeits: number;
		};
		expect(v).toEqual({ wins_red: 1, wins_white: 0, forfeits: 0 });
		expect(winrate?.sampleCount).toBe(1);
	});

	it("accumulates winrate across multiple matches with the same profile pair", async () => {
		const { db } = makeTestDb();
		await seedFinishedMatch(db, "m1", "red");
		await refreshOnMatchEnd(db, "m1");
		await seedFinishedMatch(db, "m2", "white");
		await refreshOnMatchEnd(db, "m2");
		await seedFinishedMatch(db, "m3", "forfeit-red");
		await refreshOnMatchEnd(db, "m3");

		const winrate = await analyticsRepo.getAggregate(
			db,
			"winrate:balanced-medium:vs:balanced-medium",
		);
		const v = JSON.parse(winrate?.valueJson ?? "{}") as {
			wins_red: number;
			wins_white: number;
			forfeits: number;
		};
		expect(v).toEqual({ wins_red: 1, wins_white: 1, forfeits: 1 });
		expect(winrate?.sampleCount).toBe(3);
	});

	it("keeps separate winrate aggregates for different profile pairs", async () => {
		const { db } = makeTestDb();
		await seedFinishedMatch(
			db,
			"m1",
			"red",
			40,
			"aggressive-hard",
			"defensive-hard",
		);
		await seedFinishedMatch(
			db,
			"m2",
			"white",
			40,
			"balanced-easy",
			"balanced-easy",
		);
		await refreshOnMatchEnd(db, "m1");
		await refreshOnMatchEnd(db, "m2");

		const a = await analyticsRepo.getAggregate(
			db,
			"winrate:aggressive-hard:vs:defensive-hard",
		);
		const b = await analyticsRepo.getAggregate(
			db,
			"winrate:balanced-easy:vs:balanced-easy",
		);
		expect(a?.sampleCount).toBe(1);
		expect(b?.sampleCount).toBe(1);
	});

	it("computes avg_ply_count:overall correctly", async () => {
		const { db } = makeTestDb();
		await seedFinishedMatch(db, "m1", "red", 30);
		await seedFinishedMatch(db, "m2", "white", 50);
		await seedFinishedMatch(db, "m3", "red", 40);
		await refreshOnMatchEnd(db, "m1");
		await refreshOnMatchEnd(db, "m2");
		await refreshOnMatchEnd(db, "m3");

		const avg = await analyticsRepo.getAggregate(db, "avg_ply_count:overall");
		expect(avg).not.toBeNull();
		expect(JSON.parse(avg?.valueJson ?? "0")).toBe(40);
		expect(avg?.sampleCount).toBe(3);
	});

	it("computes forfeit_rate per profile correctly", async () => {
		const { db } = makeTestDb();
		// aggressive-hard plays 3 times: forfeits once as red, wins twice.
		await seedFinishedMatch(
			db,
			"m1",
			"forfeit-red",
			40,
			"aggressive-hard",
			"defensive-hard",
		);
		await seedFinishedMatch(
			db,
			"m2",
			"red",
			40,
			"aggressive-hard",
			"defensive-hard",
		);
		await seedFinishedMatch(
			db,
			"m3",
			"red",
			40,
			"aggressive-hard",
			"defensive-hard",
		);
		await refreshOnMatchEnd(db, "m1");
		await refreshOnMatchEnd(db, "m2");
		await refreshOnMatchEnd(db, "m3");

		const aggressive = await analyticsRepo.getAggregate(
			db,
			"forfeit_rate:by_profile:aggressive-hard",
		);
		expect(aggressive?.sampleCount).toBe(3);
		expect(JSON.parse(aggressive?.valueJson ?? "0")).toBeCloseTo(1 / 3, 5);

		const defensive = await analyticsRepo.getAggregate(
			db,
			"forfeit_rate:by_profile:defensive-hard",
		);
		expect(defensive?.sampleCount).toBe(3);
		// defensive-hard never forfeited (forfeit-red means red gave up)
		expect(JSON.parse(defensive?.valueJson ?? "0")).toBe(0);
	});

	it("is a no-op for an unfinished match", async () => {
		const { db } = makeTestDb();
		await matchesRepo.createMatch(db, {
			id: "m1",
			redProfile: "balanced-medium",
			whiteProfile: "balanced-medium",
			openingPositionHash: "hash",
			coinFlipSeed: "seed",
		});
		// match not finalized
		await refreshOnMatchEnd(db, "m1");

		expect(
			await analyticsRepo.getAggregate(
				db,
				"winrate:balanced-medium:vs:balanced-medium",
			),
		).toBeNull();
	});
});

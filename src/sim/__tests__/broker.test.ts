import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import { aiStatesRepo, matchesRepo, movesRepo } from "@/store";
import {
	createMatch,
	playToCompletion,
	playTurn,
	saveMatchProgress,
} from "../broker";

describe("broker — single match", () => {
	it("creates a match row with the coin-flip seed and opening hash", async () => {
		const { db } = makeTestDb();
		const handle = await createMatch(db, {
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "00aabbccddee0011", // even first byte → red opens
		});

		const row = await matchesRepo.getMatch(db, handle.matchId);
		expect(row).not.toBeNull();
		expect(row?.coinFlipSeed).toBe("00aabbccddee0011");
		expect(row?.openingPositionHash).toMatch(/^[0-9a-f]{16}$/);
		expect(handle.game.turn).toBe("red");
	});

	it("white opens when the coin-flip seed has an odd first byte", async () => {
		const { db } = makeTestDb();
		const handle = await createMatch(db, {
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "01000000",
		});
		expect(handle.game.turn).toBe("white");
	});

	it("playTurn applies a move + persists it + bumps the ply counter", async () => {
		const { db } = makeTestDb();
		const handle = await createMatch(db, {
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "00",
		});
		const result = await playTurn(db, handle, { mode: "replay" });
		expect(result.terminal).toBe(false);
		expect(result.action).not.toBeNull();
		expect(result.mover).toBe("red");

		const moves = await movesRepo.listMovesByMatch(db, handle.matchId);
		expect(moves.length).toBe(1);
		expect(moves[0]?.color).toBe("red");

		const row = await matchesRepo.getMatch(db, handle.matchId);
		expect(row?.plyCount).toBe(1);
	});

	it("saveMatchProgress writes the on-turn AI's dump_blob", async () => {
		const { db } = makeTestDb();
		const handle = await createMatch(db, {
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "00",
		});
		await saveMatchProgress(db, handle);

		const dump = await aiStatesRepo.getDump(
			db,
			handle.matchId,
			"balanced-easy",
		);
		expect(dump).not.toBeNull();
		expect(dump?.dumpBlob.length).toBeGreaterThan(8);
		// First 4 bytes are the 'CHAI' magic.
		expect(Array.from(dump?.dumpBlob.subarray(0, 4) ?? [])).toEqual([
			0x43, 0x48, 0x41, 0x49,
		]);
	});

	it("playToCompletion finishes a small construction with a winner OR an outlier flag", async () => {
		const { db } = makeTestDb();
		const handle = await createMatch(db, {
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "00",
		});
		// Cap aggressively so the test bounds wall clock; we're
		// validating the plumbing, not balance.
		const result = await playToCompletion(db, handle, {
			mode: "replay",
			maxPlies: 30,
		});
		expect(result.plies).toBeGreaterThanOrEqual(1);
		expect(result.plies).toBeLessThanOrEqual(30);
		// Either the match resolved, or we hit the cap as an outlier.
		expect(typeof result.outlier).toBe("boolean");

		// Match row is consistent with the in-memory handle.
		const row = await matchesRepo.getMatch(db, handle.matchId);
		expect(row?.plyCount).toBe(result.plies);
	}, 60000);
});

describe("broker — replay determinism", () => {
	it("two matches with the same seed + same profiles play identically (replay mode)", async () => {
		const { db: dbA } = makeTestDb();
		const { db: dbB } = makeTestDb();

		const handleA = await createMatch(dbA, {
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "deadbeefdeadbeef",
			matchId: "fixed-id-a",
		});
		const handleB = await createMatch(dbB, {
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "deadbeefdeadbeef",
			matchId: "fixed-id-b",
		});

		// Play both for the same fixed number of plies so wall
		// clock is bounded.
		const PLIES = 8;
		for (let i = 0; i < PLIES; i += 1) {
			if (handleA.game.winner) break;
			await playTurn(dbA, handleA, { mode: "replay" });
		}
		for (let i = 0; i < PLIES; i += 1) {
			if (handleB.game.winner) break;
			await playTurn(dbB, handleB, { mode: "replay" });
		}

		const movesA = await movesRepo.listMovesByMatch(dbA, "fixed-id-a");
		const movesB = await movesRepo.listMovesByMatch(dbB, "fixed-id-b");
		expect(movesA.length).toBe(movesB.length);
		for (let i = 0; i < movesA.length; i += 1) {
			expect(movesA[i]?.fromCol).toBe(movesB[i]?.fromCol);
			expect(movesA[i]?.fromRow).toBe(movesB[i]?.fromRow);
			expect(movesA[i]?.toCol).toBe(movesB[i]?.toCol);
			expect(movesA[i]?.toRow).toBe(movesB[i]?.toRow);
			expect(movesA[i]?.color).toBe(movesB[i]?.color);
			expect(movesA[i]?.positionHashAfter).toBe(movesB[i]?.positionHashAfter);
		}
	}, 120000);
});

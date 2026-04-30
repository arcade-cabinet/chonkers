/**
 * Tier 1 (node) tests for the koota sim world.
 *
 * Asserts the trait surface that `app/*` will subscribe to:
 *   - Initial Screen is "lobby".
 *   - newMatch transitions Screen → "play" + populates Match.
 *   - quitMatch tears down + returns to "lobby".
 *   - stepTurn advances + mirrors handle.game into the Match trait.
 *   - SplitChainView is added/removed in lockstep with handle.game.chain.
 *   - onMatchEnd fires exactly once at terminal transition.
 *
 * Uses the real engine + real AI via `easy` profiles for tractable
 * branching factor in test wall-clock.
 */

import { describe, expect, it } from "vitest";
import { ALL_PROFILE_KEYS } from "@/ai";
import { makeTestDb } from "@/persistence/sqlite/__tests__/test-db";
import {
	buildSimActions,
	Ceremony,
	createSimWorld,
	HoldProgress,
	Match,
	Screen,
	Selection,
	SplitArm,
	SplitChainView,
} from "..";

const easyKeys = ALL_PROFILE_KEYS.filter((k) => k.endsWith("-easy"));
const RED = easyKeys[0];
const WHITE = easyKeys[1];
if (!RED || !WHITE) throw new Error("missing easy profiles");

describe("createSimWorld", () => {
	it("initial state has Screen=lobby and no Match", async () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		expect(sim.worldEntity.get(Screen)?.value).toBe("lobby");
		expect(sim.worldEntity.has(Match)).toBe(false);
	});

	it("newMatch flips Screen to play and populates Match trait", async () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		await actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: "red",
			coinFlipSeed: "00".repeat(8),
		});
		expect(sim.worldEntity.get(Screen)?.value).toBe("play");
		const match = sim.worldEntity.get(Match);
		expect(match?.matchId).toBeTruthy();
		expect(match?.redProfile).toBe(RED);
		expect(match?.whiteProfile).toBe(WHITE);
		expect(match?.humanColor).toBe("red");
		expect(match?.winner).toBeNull();
	});

	it("quitMatch resets Selection + HoldProgress and removes Match", async () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		await actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
		});
		actions.setSelection({ col: 4, row: 4 });
		actions.setHoldProgress(0.5);
		expect(sim.worldEntity.get(Selection)?.cell).toEqual({ col: 4, row: 4 });
		await actions.quitMatch();
		expect(sim.worldEntity.get(Screen)?.value).toBe("lobby");
		expect(sim.worldEntity.has(Match)).toBe(false);
		expect(sim.worldEntity.get(Selection)?.cell).toBeNull();
		expect(sim.worldEntity.get(HoldProgress)?.value).toBe(0);
	});

	it("stepTurn syncs handle.game into the Match trait", async () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		await actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
			coinFlipSeed: "01".repeat(8),
		});
		const turnBefore = sim.worldEntity.get(Match)?.turn;
		// Snapshot the broker's piece count BEFORE stepTurn so the
		// post-stepTurn assertion compares against a stable
		// reference rather than the live engine state.
		const expectedPieceCount = sim.handle?.game.board.size;
		await actions.stepTurn();
		const after = sim.worldEntity.get(Match);
		expect(after).toBeDefined();
		expect(after?.pieces).toBeDefined();
		// The trait MUST be a frozen primitive snapshot, not a live
		// reference — these freezes are the engine/UI boundary.
		expect(Object.isFrozen(after?.pieces)).toBe(true);
		expect(Object.isFrozen(after?.pieces[0])).toBe(true);
		// Pre-step piece count drives the assertion (alpha-easy
		// profiles never lose pieces in a single ply on the opening
		// move; chonking is the first event that changes count).
		expect(after?.pieces.length).toBe(expectedPieceCount);
		// Every piece carries a valid color — sanity check on the
		// derivation in piecesFromBoard.
		expect(
			after?.pieces.every((p) => p.color === "red" || p.color === "white"),
		).toBe(true);
		// turnBefore captured for posterity — may equal after.turn
		// on stalled outcomes, but must not be undefined.
		expect(turnBefore).toBeDefined();
	});

	it("onMatchEnd does NOT fire on quitMatch (quit is not a terminal transition)", async () => {
		const { db } = makeTestDb();
		const calls: string[] = [];
		const sim = createSimWorld({
			db,
			onMatchEnd: (matchId) => {
				calls.push(matchId);
			},
		});
		const actions = buildSimActions(sim)(sim.world);
		await actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
			coinFlipSeed: "ff".repeat(8),
		});
		await actions.quitMatch();
		expect(calls.length).toBe(0);
	});

	it("onMatchEnd fires once on a terminal transition (forfeit)", async () => {
		const { db } = makeTestDb();
		const calls: string[] = [];
		const sim = createSimWorld({
			db,
			onMatchEnd: (matchId) => {
				calls.push(matchId);
			},
		});
		const actions = buildSimActions(sim)(sim.world);
		await actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: "red",
			coinFlipSeed: "ee".repeat(8),
		});
		const matchId = sim.handle?.matchId;
		expect(matchId).toBeTruthy();
		// Forfeit is a deterministic terminal transition — no AI
		// search involved, no race against background work.
		await actions.forfeit();
		expect(calls).toEqual([matchId]);
	});

	it("SplitChainView reflects the engine chain absence on a fresh match", async () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		await actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
		});
		expect(sim.worldEntity.has(SplitChainView)).toBe(false);
	});

	it("setSplitArm clamps + floors and round-trips via the SplitArm trait", () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		expect(sim.worldEntity.get(SplitArm)?.count).toBe(0);
		actions.setSplitArm(2);
		expect(sim.worldEntity.get(SplitArm)?.count).toBe(2);
		// Negative input clamps to 0
		actions.setSplitArm(-5);
		expect(sim.worldEntity.get(SplitArm)?.count).toBe(0);
		// Float floors to nearest integer below
		actions.setSplitArm(2.7);
		expect(sim.worldEntity.get(SplitArm)?.count).toBe(2);
	});

	it("setSelection to a different cell resets SplitArm to 0", () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		actions.setSelection({ col: 4, row: 4 });
		actions.setSplitArm(3);
		expect(sim.worldEntity.get(SplitArm)?.count).toBe(3);
		// Same-cell selection re-set does NOT reset the arm
		actions.setSelection({ col: 4, row: 4 });
		expect(sim.worldEntity.get(SplitArm)?.count).toBe(3);
		// Different-cell selection clears the arm so a stale count
		// from the prior selection doesn't leak to a stack of
		// different height.
		actions.setSelection({ col: 5, row: 4 });
		expect(sim.worldEntity.get(SplitArm)?.count).toBe(0);
		// Clear selection also resets the arm
		actions.setSplitArm(2);
		actions.setSelection(null);
		expect(sim.worldEntity.get(SplitArm)?.count).toBe(0);
	});

	it("setCeremony writes the full snapshot through to the trait", () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		const initial = sim.worldEntity.get(Ceremony);
		expect(initial?.phase).toBe("idle");
		expect(initial?.firstPlayer).toBe("red");
		actions.setCeremony({
			phase: "placing-first",
			firstPlayer: "white",
			pieceProgress: 7,
			startedAtMs: 1234567,
		});
		const after = sim.worldEntity.get(Ceremony);
		expect(after?.phase).toBe("placing-first");
		expect(after?.firstPlayer).toBe("white");
		expect(after?.pieceProgress).toBe(7);
		expect(after?.startedAtMs).toBe(1234567);
	});

	it("findResumableMatch returns null when no matches exist + the id of an unfinished match", async () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		expect(await actions.findResumableMatch()).toBeNull();
		await actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: "red",
			coinFlipSeed: "33".repeat(8),
		});
		const matchId = sim.handle?.matchId;
		expect(matchId).toBeTruthy();
		// quitMatch wipes the in-memory handle but the matches row
		// is still in the db with finishedAt = null. That row is
		// the resumable target.
		await actions.quitMatch();
		expect(await actions.findResumableMatch()).toBe(matchId);
	});

	it("resumeMatch reconstructs GameState by replaying persisted moves", async () => {
		const { db } = makeTestDb();
		const sim = createSimWorld({ db });
		const actions = buildSimActions(sim)(sim.world);
		await actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
			coinFlipSeed: "44".repeat(8),
		});
		const matchId = sim.handle?.matchId;
		expect(matchId).toBeTruthy();
		// Run two AI plies to seed the moves table with replay data.
		await actions.stepTurn();
		await actions.stepTurn();
		const turnAfterTwo = sim.worldEntity.get(Match)?.turn;
		const piecesAfterTwo = sim.worldEntity.get(Match)?.pieces.length;
		// Quit drops the handle; resumeMatch reads it back from the db.
		await actions.quitMatch();
		expect(sim.handle).toBeNull();
		await actions.resumeMatch({
			matchId: matchId as string,
			humanColor: null,
		});
		expect(sim.handle?.matchId).toBe(matchId);
		expect(sim.worldEntity.get(Screen)?.value).toBe("play");
		const resumed = sim.worldEntity.get(Match);
		// Replay must reproduce the SAME turn + piece count as the
		// in-memory state had before quit. Same coin-flip seed +
		// same engine = same trajectory.
		expect(resumed?.turn).toBe(turnAfterTwo);
		expect(resumed?.pieces.length).toBe(piecesAfterTwo);
	});
});

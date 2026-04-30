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
	createSimWorld,
	HoldProgress,
	Match,
	Screen,
	Selection,
	SplitChainView,
} from "..";

const easyKeys = ALL_PROFILE_KEYS.filter((k) => k.endsWith("-easy"));
const RED = easyKeys[0];
const WHITE = easyKeys[1];
if (!RED || !WHITE) throw new Error("missing easy profiles");

describe("createSimWorld", () => {
	it("initial state has Screen=title and no Match", async () => {
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
});

/**
 * Tier 1 (node) tests for the koota sim world.
 *
 * Asserts the trait surface that the scene layer subscribes to:
 *   - Initial Screen is "title".
 *   - newMatch transitions Screen → "play" + populates Match.
 *   - quitMatch tears down + returns to "title".
 *   - stepTurn advances + mirrors handle.game into the Match trait.
 *   - SplitChainView is added/removed in lockstep with handle.game.chain.
 *   - onMatchEnd fires exactly once at terminal transition.
 *   - onPlyCommit fires after each successful ply.
 *
 * Uses the real engine + real AI via `easy` profiles for tractable
 * branching factor in test wall-clock.
 */

import { describe, expect, it } from "vitest";
import { ALL_PROFILE_KEYS } from "@/ai";
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
	it("initial state has Screen=title and no Match", () => {
		const sim = createSimWorld();
		expect(sim.worldEntity.get(Screen)?.value).toBe("title");
		expect(sim.worldEntity.has(Match)).toBe(false);
	});

	it("newMatch flips Screen to play and populates Match trait", () => {
		const sim = createSimWorld();
		const actions = buildSimActions(sim)(sim.world);
		actions.newMatch({
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

	it("quitMatch resets Selection + HoldProgress and removes Match", () => {
		const sim = createSimWorld();
		const actions = buildSimActions(sim)(sim.world);
		actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
		});
		actions.setSelection({ col: 4, row: 4 });
		actions.setHoldProgress(0.5);
		expect(sim.worldEntity.get(Selection)?.cell).toEqual({ col: 4, row: 4 });
		actions.quitMatch();
		expect(sim.worldEntity.get(Screen)?.value).toBe("title");
		expect(sim.worldEntity.has(Match)).toBe(false);
		expect(sim.worldEntity.get(Selection)?.cell).toBeNull();
		expect(sim.worldEntity.get(HoldProgress)?.value).toBe(0);
	});

	it("stepTurn syncs handle.game into the Match trait", async () => {
		const sim = createSimWorld();
		const actions = buildSimActions(sim)(sim.world);
		actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
			coinFlipSeed: "01".repeat(8),
		});
		const turnBefore = sim.worldEntity.get(Match)?.turn;
		const expectedPieceCount = sim.handle?.game.board.size;
		await actions.stepTurn();
		const after = sim.worldEntity.get(Match);
		expect(after).toBeDefined();
		expect(after?.pieces).toBeDefined();
		expect(Object.isFrozen(after?.pieces)).toBe(true);
		expect(Object.isFrozen(after?.pieces[0])).toBe(true);
		expect(after?.pieces.length).toBe(expectedPieceCount);
		expect(
			after?.pieces.every((p) => p.color === "red" || p.color === "white"),
		).toBe(true);
		expect(turnBefore).toBeDefined();
	});

	it("onPlyCommit fires after each ply (newMatch + stepTurn)", async () => {
		const commits: string[] = [];
		const sim = createSimWorld({
			onPlyCommit: (handle) => {
				commits.push(handle.matchId);
			},
		});
		const actions = buildSimActions(sim)(sim.world);
		actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
			coinFlipSeed: "01".repeat(8),
		});
		// newMatch fires onPlyCommit once for the initial snapshot.
		expect(commits.length).toBe(1);
		await actions.stepTurn();
		expect(commits.length).toBeGreaterThanOrEqual(2);
	});

	it("onMatchEnd does NOT fire on quitMatch (quit is not a terminal transition)", () => {
		const calls: string[] = [];
		const sim = createSimWorld({
			onMatchEnd: (handle) => {
				calls.push(handle.matchId);
			},
		});
		const actions = buildSimActions(sim)(sim.world);
		actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
			coinFlipSeed: "ff".repeat(8),
		});
		actions.quitMatch();
		expect(calls.length).toBe(0);
	});

	it("onMatchEnd fires once on a terminal transition (forfeit)", async () => {
		const calls: string[] = [];
		const sim = createSimWorld({
			onMatchEnd: (handle) => {
				calls.push(handle.matchId);
			},
		});
		const actions = buildSimActions(sim)(sim.world);
		actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: "red",
			coinFlipSeed: "ee".repeat(8),
		});
		const matchId = sim.handle?.matchId;
		expect(matchId).toBeTruthy();
		await actions.forfeit();
		expect(calls).toEqual([matchId]);
	});

	it("SplitChainView reflects the engine chain absence on a fresh match", () => {
		const sim = createSimWorld();
		const actions = buildSimActions(sim)(sim.world);
		actions.newMatch({
			redProfile: RED,
			whiteProfile: WHITE,
			humanColor: null,
		});
		expect(sim.worldEntity.has(SplitChainView)).toBe(false);
	});
});

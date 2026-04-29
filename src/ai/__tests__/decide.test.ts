import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine";
import { emptyBoard, setPiece } from "@/engine";
import { chooseAction, createAiState, getProfile } from "..";

function smallState(): GameState {
	let board = emptyBoard();
	board = setPiece(board, { col: 4, row: 1, height: 0, color: "red" });
	board = setPiece(board, { col: 5, row: 1, height: 0, color: "red" });
	board = setPiece(board, { col: 4, row: 9, height: 0, color: "white" });
	board = setPiece(board, { col: 5, row: 9, height: 0, color: "white" });
	return { board, turn: "red", chain: null, winner: null };
}

describe("chooseAction — replay mode determinism", () => {
	it("returns the same decision for the same (state, profile, mode)", () => {
		// Use a small constructed state + the easy profile so the test
		// runs in <100ms. The determinism contract is structural —
		// depth doesn't affect it, only consistency across calls — so
		// depth=2 on 4 pieces is sufficient witness for "same state
		// same profile → same action".
		const profile = getProfile("balanced-easy");
		const state = smallState();
		const aiA = createAiState("balanced-easy");
		const aiB = createAiState("balanced-easy");

		const a = chooseAction(state, profile, "red", aiA, { mode: "replay" });
		const b = chooseAction(state, profile, "red", aiB, { mode: "replay" });

		expect(a).toEqual(b);
	});

	it("returns 'act' from a small constructed position for every disposition at easy depth", () => {
		// Use a SMALL board (2 owned cells per side) so depth-2 search
		// runs fast. The original initial state has 24 pieces and 192+
		// initial actions which makes alpha-beta search too expensive
		// for unit-test budgets even at depth 2 without further pruning.
		// The 100-run broker (PRQ-2 task 30) covers full-board AI play.
		let board = emptyBoard();
		board = setPiece(board, { col: 4, row: 1, height: 0, color: "red" });
		board = setPiece(board, { col: 5, row: 1, height: 0, color: "red" });
		board = setPiece(board, { col: 4, row: 9, height: 0, color: "white" });
		board = setPiece(board, { col: 5, row: 9, height: 0, color: "white" });
		const state: GameState = {
			board,
			turn: "red",
			chain: null,
			winner: null,
		};
		for (const key of [
			"aggressive-easy",
			"balanced-easy",
			"defensive-easy",
		] as const) {
			const profile = getProfile(key);
			const decision = chooseAction(
				state,
				profile,
				"red",
				createAiState(key),
				{ mode: "replay" },
			);
			expect(decision.kind).toBe("act");
		}
	});

	it("returns the same decision regardless of profile object identity (referential vs structural)", () => {
		// Construct two profile objects with the same data and verify
		// chooseAction yields the same Decision. This guards against
		// any profile-object identity comparisons sneaking into the
		// determinism contract.
		const profile = getProfile("balanced-easy");
		const profileCopy = JSON.parse(JSON.stringify(profile));
		const state = smallState();

		const a = chooseAction(state, profile, "red", createAiState("balanced-easy"), {
			mode: "replay",
		});
		const b = chooseAction(state, profileCopy, "red", createAiState("balanced-easy"), {
			mode: "replay",
		});

		expect(a).toEqual(b);
	});
});

describe("chooseAction — forfeit policy", () => {
	it("forfeits a position where the explicit winner is the opponent", () => {
		// Build a state where red has just one piece (so a search
		// returns at least one action — empty action lists go to the
		// 'stalled' branch instead) and the explicit winner is white.
		// `evaluate` returns -TERMINAL_WIN_SCORE which is far below
		// every profile's forfeit threshold.
		let board = emptyBoard();
		board = setPiece(board, { col: 4, row: 5, height: 0, color: "red" });
		const state: GameState = {
			board,
			turn: "red",
			chain: null,
			winner: "white",
		};

		// `applyAction` rejects further moves once a winner is set, so
		// we exercise forfeit through the no-actions branch. enumerate
		// returns [] when winner is non-null per src/engine/moves.ts.
		const decision = chooseAction(
			state,
			getProfile("balanced-medium"),
			"red",
			createAiState("balanced-medium"),
			{ mode: "replay" },
		);
		expect(decision.kind).toBe("forfeit");
	});
});

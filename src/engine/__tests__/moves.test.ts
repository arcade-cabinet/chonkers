import { describe, expect, it } from "vitest";
import type { Action, Board, GameState } from "..";
import {
	applyAction,
	createInitialState,
	emptyBoard,
	enumerateLegalActions,
	IllegalActionError,
	isChainActive,
	materializeStack,
	setPiece,
	stackHeight,
} from "..";

function gs(board: Board, turn: "red" | "white" = "red"): GameState {
	return { board, turn, chain: null, winner: null };
}

describe("applyAction — full-stack moves", () => {
	it("moves a 1-stack one cell forward", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		const state = gs(b, "red");
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0], to: { col: 4, row: 5 } }],
		};
		const next = applyAction(state, action);
		expect(stackHeight(next.board, { col: 4, row: 4 })).toBe(0);
		expect(stackHeight(next.board, { col: 4, row: 5 })).toBe(1);
		expect(next.turn).toBe("white");
	});

	it("rejects diagonal-of-2 moves (Chebyshev distance > 1)", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0], to: { col: 6, row: 6 } }],
		};
		expect(() => applyAction(gs(b, "red"), action)).toThrow(IllegalActionError);
	});

	it("rejects moving a stack the player does not own", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "white" });
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0], to: { col: 4, row: 5 } }],
		};
		expect(() => applyAction(gs(b, "red"), action)).toThrow(/owned by white/);
	});

	it("chonking — 1-stack onto another 1-stack lifts it as a 2-stack with mover on top", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "white" });
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0], to: { col: 4, row: 5 } }],
		};
		const next = applyAction(gs(b, "red"), action);
		const stack = materializeStack(next.board, { col: 4, row: 5 });
		expect(stack.map((p) => p.color)).toEqual(["white", "red"]);
	});

	it("rejects chonking onto a SHORTER stack (RULES.md §4.2)", () => {
		// 2-stack source on (4,4); 1-stack dest on (4,5). Source > dest height.
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 4, height: 1, color: "red" });
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "white" });
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0, 1], to: { col: 4, row: 5 } }],
		};
		expect(() => applyAction(gs(b, "red"), action)).toThrow(/cannot chonk/);
	});

	it("allows a 2-stack to chonk a 2-stack (equal height OK)", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 4, height: 1, color: "red" });
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "white" });
		b = setPiece(b, { col: 4, row: 5, height: 1, color: "white" });
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0, 1], to: { col: 4, row: 5 } }],
		};
		const next = applyAction(gs(b, "red"), action);
		expect(stackHeight(next.board, { col: 4, row: 5 })).toBe(4);
	});
});

describe("applyAction — splits", () => {
	it("commits a contiguous-run split as one move (no chain)", () => {
		// 3-stack red on (4,4); split off the top 2 to (4,5).
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 4, height: 1, color: "red" });
		b = setPiece(b, { col: 4, row: 4, height: 2, color: "red" });
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0, 1], to: { col: 4, row: 5 } }],
		};
		const next = applyAction(gs(b, "red"), action);
		expect(stackHeight(next.board, { col: 4, row: 4 })).toBe(1);
		expect(stackHeight(next.board, { col: 4, row: 5 })).toBe(2);
		expect(isChainActive(next)).toBe(false);
		expect(next.turn).toBe("white");
	});

	it("non-contiguous split begins a forced split chain (queued indices rebased)", () => {
		// 4-stack red on (4,4); selection {0, 2} (top + 2nd-from-bottom).
		// After committing run 0 ([0] = topmost), the source compacts to
		// a 3-stack; the queued [2] (against the original 4-stack) MUST
		// be rebased to [1] (against the residual 3-stack), otherwise
		// the chain step on the next turn would either read an
		// out-of-bounds index or detach the wrong piece.
		let b = emptyBoard();
		for (let h = 0; h < 4; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [
				{ indices: [0], to: { col: 4, row: 5 } }, // first run: just slice 0
				{ indices: [2], to: { col: 4, row: 5 } }, // queued; rebased to [1]
			],
		};
		const next = applyAction(gs(b, "red"), action);
		expect(isChainActive(next)).toBe(true);
		expect(next.chain?.remainingDetachments).toEqual([[1]]);
		expect(next.turn).toBe("white"); // control flips even mid-chain (RULES §5.4 step 2)
	});

	it("rebases all queued detachments after a multi-run partition", () => {
		// 6-stack red on (4,4); split selection {0,1,3,5} partitions
		// into runs [[0,1],[3],[5]]. After committing run [0,1] (the
		// top two), the source compacts to a 4-stack. Queued [3] must
		// rebase to [1] (lost two indices < 3) and queued [5] must
		// rebase to [3] (lost two indices < 5).
		let b = emptyBoard();
		for (let h = 0; h < 6; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [
				{ indices: [0, 1], to: { col: 4, row: 5 } },
				{ indices: [3], to: { col: 4, row: 5 } },
				{ indices: [5], to: { col: 4, row: 5 } },
			],
		};
		const next = applyAction(gs(b, "red"), action);
		expect(next.chain?.remainingDetachments).toEqual([[1], [3]]);
	});

	it("rejects an empty run", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 4, height: 1, color: "red" });
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [], to: { col: 4, row: 5 } }],
		};
		expect(() => applyAction(gs(b, "red"), action)).toThrow();
	});
});

describe("enumerateLegalActions — initial state", () => {
	it("produces a non-empty set of moves for red on opening", () => {
		const state = createInitialState();
		const actions = enumerateLegalActions(state);
		expect(actions.length).toBeGreaterThan(0);
		// Every action should source from a red-owned cell.
		for (const action of actions) {
			const stack = materializeStack(state.board, action.from);
			const top = stack[stack.length - 1];
			expect(top?.color).toBe("red");
		}
	});

	it("returns empty when winner is set", () => {
		const state: GameState = {
			board: emptyBoard(),
			turn: "red",
			chain: null,
			winner: "red",
		};
		expect(enumerateLegalActions(state)).toEqual([]);
	});
});

describe("applyAction — chain steps", () => {
	it("rejects an action that does not match the chain head", () => {
		let b = emptyBoard();
		for (let h = 0; h < 4; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const state: GameState = {
			board: b,
			turn: "red",
			chain: {
				source: { col: 4, row: 4 },
				remainingDetachments: [[2]],
			},
			winner: null,
		};
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0], to: { col: 4, row: 5 } }], // wrong: head expects [2]
		};
		expect(() => applyAction(state, action)).toThrow(/do not match expected/);
	});
});

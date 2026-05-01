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

	it("non-contiguous split commits ALL runs in one turn when destinations are legal (RULES §5.4)", () => {
		// 4-stack red on (4,4); selection {0, 2} partitions into runs
		// [[0], [2]]. Both runs land on legal empty cells in the same
		// applyAction call — no chain remains, control flips to white
		// once. The queued [2] is rebased against the residual 3-stack
		// (after slice 0 detached) before its commit; it lands on the
		// piece that was originally height=1.
		let b = emptyBoard();
		for (let h = 0; h < 4; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [
				{ indices: [0], to: { col: 4, row: 5 } }, // slice 0: top piece → (4,5)
				{ indices: [2], to: { col: 5, row: 4 } }, // rebased to [1] → (5,4)
			],
		};
		const next = applyAction(gs(b, "red"), action);
		expect(isChainActive(next)).toBe(false);
		expect(next.chain).toBeNull();
		expect(next.turn).toBe("white");
		// Source: 4-stack minus 2 pieces = 2-stack remaining at (4,4).
		expect(stackHeight(next.board, { col: 4, row: 4 })).toBe(2);
		expect(stackHeight(next.board, { col: 4, row: 5 })).toBe(1);
		expect(stackHeight(next.board, { col: 5, row: 4 })).toBe(1);
	});

	it("multi-run split commits all three runs in one turn when destinations are legal", () => {
		// 6-stack red on (4,4); selection {0, 2, 4} → runs [[0],[2],[4]].
		// Three different empty destinations; all three commit in the
		// same applyAction call.
		let b = emptyBoard();
		for (let h = 0; h < 6; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [
				{ indices: [0], to: { col: 4, row: 5 } },
				{ indices: [2], to: { col: 5, row: 5 } },
				{ indices: [4], to: { col: 3, row: 5 } },
			],
		};
		const next = applyAction(gs(b, "red"), action);
		expect(next.chain).toBeNull();
		expect(next.turn).toBe("white");
		expect(stackHeight(next.board, { col: 4, row: 4 })).toBe(3);
		expect(stackHeight(next.board, { col: 4, row: 5 })).toBe(1);
		expect(stackHeight(next.board, { col: 5, row: 5 })).toBe(1);
		expect(stackHeight(next.board, { col: 3, row: 5 })).toBe(1);
	});

	it("STALL (§5.4.1): queued run with no legal destination freezes remainder into state.chain", () => {
		// Construct a stall: 4-stack red at (4,4), selection {0, 2}
		// partitions into [[0], [2]]. First run [0] lands on (4,5).
		// Second run [2] is rebased to [1] against the 3-stack residual
		// — but its declared destination (5,4) holds a 1-stack of
		// white. A 1-piece sub-stack onto a 1-stack is LEGAL (chonk).
		// So instead, point the second run at a 0-height destination
		// that is NOT adjacent so validateRun would throw — but we want
		// a STALL not a malformed action. The reliable stall recipe:
		// a 2-piece sub-stack onto a 1-height dest, which is illegal.
		// Setup: 5-stack red at (4,4), selection {0, 1, 3} → runs
		// [[0, 1], [3]]. First run is a 2-stack landing on a 1-stack
		// at (4,5)? No — that's also illegal. Construct it as:
		// 2-stack source for first run lands on a 2-stack legal dest;
		// queued 1-piece [3] aimed at a cell whose height changes.
		//
		// Cleanest stall: pre-existing chain field with an impossible
		// head. The reducer's chain-retry path returns a chain-died
		// state when the head's destination is illegal at retry, but
		// here we test the in-action stall: the queued run's
		// destination has no legal landing because of a chonk
		// performed by the EARLIER run in this same action.
		let b = emptyBoard();
		// 3-stack red at (4,4) — slices 0 (top), 1, 2 (bottom).
		for (let h = 0; h < 3; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		// 1-stack white at (4,5) — first run will chonk onto it,
		// making it height 2.
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "white" });
		// 1-stack white at (5,4) — queued run [2] (rebased to [1])
		// will be 1 piece, which CAN chonk a 1-stack. So that doesn't
		// stall. Use a different recipe:
		//
		// 4-stack red at (4,4); selection {0,1, 3} → [[0,1],[3]]
		// First run = 2 pieces. Second run = 1 piece.
		// First run's destination must support a 2-piece chonk: dest
		// height ≥ 2. Second run's destination must STALL, i.e. dest
		// height = 1 after the first run committed. Set it up so the
		// dest of run #2 is currently height 0 BUT becomes height >0
		// after run #1's chonk... that's not possible since run #2's
		// dest is a different cell.
		//
		// Right — to STALL we need run #2's destination to be height 1
		// at commit time AND run #2's sub-stack to be height ≥ 2. So
		// adjust selection: 5-stack, run #1 = [0], run #2 = [2, 3].
		// After run #1, source compacts; queued [2,3] rebases to [1,2].
		// Run #2 sub-stack is 2 pieces. Aim at a cell currently
		// holding a 1-stack → STALL.
		b = emptyBoard();
		for (let h = 0; h < 5; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		b = setPiece(b, { col: 5, row: 4, height: 0, color: "white" }); // 1-stack
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [
				{ indices: [0], to: { col: 4, row: 5 } },
				{ indices: [2, 3], to: { col: 5, row: 4 } }, // rebased to [1,2]; STALLS on 1-stack
			],
		};
		const next = applyAction(gs(b, "red"), action);
		// Run #1 committed; run #2 stalled.
		expect(stackHeight(next.board, { col: 4, row: 5 })).toBe(1);
		// Source went from 5 → 4 after first commit (still all red).
		expect(stackHeight(next.board, { col: 4, row: 4 })).toBe(4);
		// Chain frozen with the stalled run rebased to residual.
		expect(isChainActive(next)).toBe(true);
		expect(next.chain?.owner).toBe("red");
		expect(next.chain?.remainingDetachments).toEqual([[1, 2]]);
		// Control flips to opponent — chain owner is locked into retry
		// on their next turn.
		expect(next.turn).toBe("white");
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

describe("applyAction — chain retry (post-stall, RULES §5.4.1)", () => {
	it("rejects a retry action that does not match the chain head", () => {
		let b = emptyBoard();
		for (let h = 0; h < 4; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const state: GameState = {
			board: b,
			turn: "red",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
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

	it("rejects chain retry when it's not the chain owner's turn", () => {
		// White on turn but red owns the pending chain. The chain only
		// constrains the chain owner; white plays normally on their
		// own turns and does not see chain continuations in the legal-
		// action enumeration. Direct attempt to apply the chain action
		// is rejected at the owner check.
		let b = emptyBoard();
		for (let h = 0; h < 4; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const state: GameState = {
			board: b,
			turn: "white",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
				remainingDetachments: [[1]],
			},
			winner: null,
		};
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [1], to: { col: 4, row: 5 } }],
		};
		expect(() => applyAction(state, action)).toThrow(/owned by red, not white/);
	});

	it("allows chain retry when residual top is the opponent's colour but it's the chain owner's turn", () => {
		// Pre-arrange: red is mid-chain on (4,4). The residual stack
		// has a white piece on top (from prior chonking), so
		// cellOwner === white, but state.turn === red === chain.owner.
		// Without the chain-owner exemption, the standard owner check
		// would reject the retry.
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 4, height: 1, color: "white" });
		// Adjacent destination: a 1-stack the chain head can land on.
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "red" });
		const state: GameState = {
			board: b,
			turn: "red",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
				remainingDetachments: [[1]], // bottom piece (top-down 1)
			},
			winner: null,
		};
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [1], to: { col: 4, row: 5 } }],
		};
		// Should NOT throw on the owner check.
		expect(() => applyAction(state, action)).not.toThrow();
	});

	it("chain DIES when retry destination still has no legal landing", () => {
		// Setup: a chain owned by red, head detachment is a 2-piece
		// sub-stack [0, 1]. The retry action aims at a 1-stack
		// destination — a 2-piece sub-stack onto a 1-stack is illegal
		// (§4.2). Per §5.4.1 this kills the chain: residual stays put,
		// chain field clears, control flips.
		let b = emptyBoard();
		for (let h = 0; h < 3; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		b = setPiece(b, { col: 5, row: 4, height: 0, color: "white" }); // 1-stack
		const state: GameState = {
			board: b,
			turn: "red",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
				remainingDetachments: [[0, 1]],
			},
			winner: null,
		};
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0, 1], to: { col: 5, row: 4 } }],
		};
		const next = applyAction(state, action);
		// Source untouched, chain consumed, turn flipped.
		expect(stackHeight(next.board, { col: 4, row: 4 })).toBe(3);
		expect(stackHeight(next.board, { col: 5, row: 4 })).toBe(1);
		expect(next.chain).toBeNull();
		expect(next.turn).toBe("white");
	});

	it("chain retry succeeds and clears chain when only one detachment remained", () => {
		// Single-detachment chain; retry lands legally → chain done.
		let b = emptyBoard();
		for (let h = 0; h < 2; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const state: GameState = {
			board: b,
			turn: "red",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
				remainingDetachments: [[0]],
			},
			winner: null,
		};
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0], to: { col: 4, row: 5 } }],
		};
		const next = applyAction(state, action);
		expect(next.chain).toBeNull();
		expect(next.turn).toBe("white");
		expect(stackHeight(next.board, { col: 4, row: 4 })).toBe(1);
		expect(stackHeight(next.board, { col: 4, row: 5 })).toBe(1);
	});

	it("chain retry succeeds but tail remains pending (multi-detachment chain)", () => {
		// Two-detachment chain. Head retry lands legally; tail rebases
		// against the residual and stays in state.chain. Control flips.
		let b = emptyBoard();
		for (let h = 0; h < 4; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		const state: GameState = {
			board: b,
			turn: "red",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
				remainingDetachments: [[0], [2]],
			},
			winner: null,
		};
		const action: Action = {
			from: { col: 4, row: 4 },
			runs: [{ indices: [0], to: { col: 4, row: 5 } }],
		};
		const next = applyAction(state, action);
		// Head committed; tail [2] rebased to [1] against the 3-stack
		// residual.
		expect(next.chain?.remainingDetachments).toEqual([[1]]);
		expect(next.turn).toBe("white");
	});
});

describe("enumerateLegalActions — chain lock-in (RULES §5.4.1)", () => {
	it("returns ONLY chain-head retries (with all legal destinations) when chain owner is on turn", () => {
		// 3-stack red at (4,4) with chain head [0] (1-piece). Adjacent
		// cells: (4,5) empty, (5,4) empty, (3,4) empty etc. All legal.
		let b = emptyBoard();
		for (let h = 0; h < 3; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		// Place an unrelated red piece elsewhere — must NOT show up in
		// enumeration (chain lock-in).
		b = setPiece(b, { col: 0, row: 0, height: 0, color: "red" });
		const state: GameState = {
			board: b,
			turn: "red",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
				remainingDetachments: [[0]],
			},
			winner: null,
		};
		const actions = enumerateLegalActions(state);
		// Every action must source from the chain source (4,4) — the
		// (0,0) piece must NOT generate any action.
		for (const a of actions) {
			expect(a.from).toEqual({ col: 4, row: 4 });
			// Every action is a single run matching the head detachment.
			expect(a.runs.length).toBe(1);
			expect(a.runs[0]?.indices).toEqual([0]);
		}
		// (4,4) has 8 adjacent cells, all empty in this fixture → 8 retries.
		expect(actions.length).toBe(8);
	});

	it("returns no actions when chain owner is on turn but no destination is legal", () => {
		// Boxed-in head: 3-stack red surrounded by white 1-stacks.
		// Chain head is a 2-piece sub-stack [0, 1]; 2-piece onto a
		// 1-stack is illegal everywhere → enumeration is empty. Caller
		// (broker) interprets this as a dead chain → forfeit/stall.
		let b = emptyBoard();
		for (let h = 0; h < 3; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		// Surround with 1-stacks (all illegal for a 2-piece sub-stack).
		const around = [
			[3, 3], [4, 3], [5, 3],
			[3, 4],         [5, 4],
			[3, 5], [4, 5], [5, 5],
		];
		for (const [c, r] of around) {
			b = setPiece(b, { col: c as number, row: r as number, height: 0, color: "white" });
		}
		const state: GameState = {
			board: b,
			turn: "red",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
				remainingDetachments: [[0, 1]],
			},
			winner: null,
		};
		const actions = enumerateLegalActions(state);
		expect(actions).toEqual([]);
	});

	it("ignores the chain when it is the OPPONENT's turn — opponent plays normally", () => {
		// Red owns a stalled chain at (4,4). It is white's turn now.
		// White has a single piece elsewhere; enumeration should give
		// white's normal moves and ignore red's chain entirely.
		let b = emptyBoard();
		for (let h = 0; h < 3; h += 1) {
			b = setPiece(b, { col: 4, row: 4, height: h, color: "red" });
		}
		b = setPiece(b, { col: 0, row: 0, height: 0, color: "white" });
		const state: GameState = {
			board: b,
			turn: "white",
			chain: {
				source: { col: 4, row: 4 },
				owner: "red",
				remainingDetachments: [[0]],
			},
			winner: null,
		};
		const actions = enumerateLegalActions(state);
		expect(actions.length).toBeGreaterThan(0);
		for (const a of actions) {
			expect(a.from).toEqual({ col: 0, row: 0 });
		}
	});
});

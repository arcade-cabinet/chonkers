import { describe, expect, it } from "vitest";
import {
	createInitialState,
	INITIAL_PIECE_COUNT,
	materializeStack,
	stackHeight,
} from "..";

describe("createInitialState", () => {
	it("places exactly 12 red and 12 white pieces", () => {
		const state = createInitialState();
		let reds = 0;
		let whites = 0;
		for (const piece of state.board.values()) {
			if (piece.color === "red") reds += 1;
			else whites += 1;
		}
		expect(reds).toBe(INITIAL_PIECE_COUNT);
		expect(whites).toBe(INITIAL_PIECE_COUNT);
	});

	it("leaves rows 0, 5, 10 empty (RULES.md §2)", () => {
		const state = createInitialState();
		for (let col = 0; col < 9; col += 1) {
			for (const row of [0, 5, 10]) {
				expect(stackHeight(state.board, { col, row })).toBe(0);
			}
		}
	});

	it("places red on rows 1, 2, 3 only", () => {
		const state = createInitialState();
		for (const piece of state.board.values()) {
			if (piece.color === "red") {
				expect([1, 2, 3]).toContain(piece.row);
			}
		}
	});

	it("places white on rows 7, 8, 9 only", () => {
		const state = createInitialState();
		for (const piece of state.board.values()) {
			if (piece.color === "white") {
				expect([7, 8, 9]).toContain(piece.row);
			}
		}
	});

	it("every starting cell is a 1-stack (height 0 is the only piece)", () => {
		const state = createInitialState();
		for (const piece of state.board.values()) {
			expect(piece.height).toBe(0);
			const stack = materializeStack(state.board, {
				col: piece.col,
				row: piece.row,
			});
			expect(stack).toHaveLength(1);
		}
	});

	it("turn defaults to red (RULES.md §3)", () => {
		expect(createInitialState().turn).toBe("red");
	});

	it("honors firstPlayer override (white opening for coin-flip-loses-red)", () => {
		expect(createInitialState("white").turn).toBe("white");
	});

	it("starts with no chain and no winner", () => {
		const state = createInitialState();
		expect(state.chain).toBeNull();
		expect(state.winner).toBeNull();
	});

	it("is deterministic — two calls produce structurally-equal boards", () => {
		const a = createInitialState();
		const b = createInitialState();
		expect(a.board.size).toBe(b.board.size);
		for (const [key, piece] of a.board) {
			expect(b.board.get(key)).toEqual(piece);
		}
	});
});

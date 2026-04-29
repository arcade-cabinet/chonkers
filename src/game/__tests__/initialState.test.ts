import { describe, expect, it } from "vitest";
import { tokens } from "@/design/tokens";
import { createInitialState, INITIAL_PIECE_COUNT } from "../initialState";

describe("createInitialState", () => {
	it("produces a 9×11 board", () => {
		const state = createInitialState();
		expect(state.board).toHaveLength(tokens.board.cols);
		for (const column of state.board) {
			expect(column).toHaveLength(tokens.board.rows);
		}
	});

	it("places exactly 12 red pieces and 12 white pieces", () => {
		const state = createInitialState();
		let red = 0;
		let white = 0;
		for (const column of state.board) {
			for (const stack of column) {
				if (!stack) continue;
				for (const piece of stack) {
					if (piece.color === "red") red += 1;
					else white += 1;
				}
			}
		}
		expect(red).toBe(INITIAL_PIECE_COUNT);
		expect(white).toBe(INITIAL_PIECE_COUNT);
	});

	it("leaves both home rows (0 and 10) and the middle row (5) empty", () => {
		const state = createInitialState();
		for (const row of [0, 5, tokens.board.rows - 1]) {
			for (let col = 0; col < tokens.board.cols; col++) {
				const column = state.board[col];
				expect(column).toBeDefined();
				expect(column?.[row]).toBeNull();
			}
		}
	});

	it("starts with red to move and no winner or chain", () => {
		const state = createInitialState();
		expect(state.turn).toBe("red");
		expect(state.winner).toBeNull();
		expect(state.chain).toBeNull();
	});

	it("every starting piece is a 1-stack of the player's colour on top", () => {
		const state = createInitialState();
		for (const column of state.board) {
			for (const stack of column) {
				if (!stack) continue;
				expect(stack).toHaveLength(1);
			}
		}
	});
});

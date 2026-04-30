import { describe, expect, it } from "vitest";
import type { GameState } from "..";
import {
	createInitialState,
	emptyBoard,
	hashBoard,
	hashGameState,
	hashGameStateHex,
	setPiece,
} from "..";

const baseState = (overrides: Partial<GameState> = {}): GameState => ({
	board: emptyBoard(),
	turn: "red",
	chain: null,
	winner: null,
	...overrides,
});

describe("hashGameState", () => {
	it("is deterministic — two calls on equivalent states return the same hash", () => {
		const a = createInitialState();
		const b = createInitialState();
		expect(hashGameState(a)).toBe(hashGameState(b));
	});

	it("different turns produce different hashes (everything else equal)", () => {
		const board = emptyBoard();
		const a = baseState({ board, turn: "red" });
		const b = baseState({ board, turn: "white" });
		expect(hashGameState(a)).not.toBe(hashGameState(b));
	});

	it("different boards produce different hashes", () => {
		let b1 = emptyBoard();
		let b2 = emptyBoard();
		b1 = setPiece(b1, { col: 0, row: 0, height: 0, color: "red" });
		b2 = setPiece(b2, { col: 1, row: 0, height: 0, color: "red" });
		expect(hashGameState(baseState({ board: b1 }))).not.toBe(
			hashGameState(baseState({ board: b2 })),
		);
	});

	it("different colours at the same position produce different hashes", () => {
		const b1 = setPiece(emptyBoard(), {
			col: 0,
			row: 0,
			height: 0,
			color: "red",
		});
		const b2 = setPiece(emptyBoard(), {
			col: 0,
			row: 0,
			height: 0,
			color: "white",
		});
		expect(hashBoard(b1)).not.toBe(hashBoard(b2));
	});

	it("hex output is 16 hex chars zero-padded", () => {
		const hex = hashGameStateHex(createInitialState());
		expect(hex).toMatch(/^[0-9a-f]{16}$/);
	});
});

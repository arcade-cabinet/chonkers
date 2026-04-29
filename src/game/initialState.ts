import { tokens } from "@/design/tokens";
import type { Board, GameState, Piece, Stack } from "./types";

/**
 * The 5-4-3 triangular starting layout described in docs/RULES.md §2.
 *
 * Red occupies rows 1, 2, 3 (advancing toward row 10).
 * White occupies rows 7, 8, 9 (advancing toward row 0).
 * Rows 0, 5, 10 are empty at start.
 */

const COLS = tokens.board.cols;
const ROWS = tokens.board.rows;

const redPiece: Piece = { color: "red" };
const whitePiece: Piece = { color: "white" };
const single = (p: Piece): Stack => [p];

// Row 1 / row 9: 5 pieces at cols 2..6
// Row 2 / row 8: 4 pieces at cols 2, 4, 5, 7  (chosen so the formation
//                visually reads as a 5-4-3 triangle pointing inward)
// Row 3 / row 7: 3 pieces at cols 3, 4, 5
const RED_LAYOUT: ReadonlyArray<{ row: number; cols: ReadonlyArray<number> }> =
	[
		{ row: 1, cols: [2, 3, 4, 5, 6] },
		{ row: 2, cols: [2, 4, 5, 7] },
		{ row: 3, cols: [3, 4, 5] },
	];

const WHITE_LAYOUT: ReadonlyArray<{
	row: number;
	cols: ReadonlyArray<number>;
}> = [
	{ row: 9, cols: [2, 3, 4, 5, 6] },
	{ row: 8, cols: [2, 4, 5, 7] },
	{ row: 7, cols: [3, 4, 5] },
];

type MutableColumn = Array<Stack | null>;

function buildEmptyBoard(): MutableColumn[] {
	return Array.from({ length: COLS }, () =>
		Array.from({ length: ROWS }, () => null),
	);
}

function place(
	board: MutableColumn[],
	col: number,
	row: number,
	piece: Piece,
): void {
	const column = board[col];
	if (!column) {
		throw new Error(
			`initialState: column ${col} out of range (0..${COLS - 1})`,
		);
	}
	column[row] = single(piece);
}

export function createInitialState(): GameState {
	const board = buildEmptyBoard();

	for (const { row, cols } of RED_LAYOUT) {
		for (const col of cols) {
			place(board, col, row, redPiece);
		}
	}

	for (const { row, cols } of WHITE_LAYOUT) {
		for (const col of cols) {
			place(board, col, row, whitePiece);
		}
	}

	return {
		board: board as Board,
		turn: "red",
		chain: null,
		winner: null,
	};
}

export const INITIAL_PIECE_COUNT = 12 as const;

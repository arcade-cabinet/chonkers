/**
 * The 5-4-3 triangular starting layout described in RULES.md §2.
 *
 * Red occupies rows 1, 2, 3 (advancing toward row 10).
 * White occupies rows 7, 8, 9 (advancing toward row 0).
 * Rows 0, 5, 10 are empty at start.
 *
 * The "first player" parameter lets the sim broker honour the
 * coin-flip seed without tying the engine to entropy: passing
 * `firstPlayer: 'red'` produces RULES §3's default; passing
 * `firstPlayer: 'white'` flips the opening turn. Both layouts are
 * IDENTICAL — only `turn` differs.
 */

import { emptyBoard, setPiece } from "./board";
import type { Board, Color, GameState } from "./types";

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

export const INITIAL_PIECE_COUNT = 12 as const;

function placeColor(
	board: Board,
	color: Color,
	layout: typeof RED_LAYOUT,
): Board {
	let out = board;
	for (const { row, cols } of layout) {
		for (const col of cols) {
			out = setPiece(out, { col, row, height: 0, color });
		}
	}
	return out;
}

export function createInitialBoard(): Board {
	let b = emptyBoard();
	b = placeColor(b, "red", RED_LAYOUT);
	b = placeColor(b, "white", WHITE_LAYOUT);
	return b;
}

export function createInitialState(firstPlayer: Color = "red"): GameState {
	return {
		board: createInitialBoard(),
		turn: firstPlayer,
		chain: null,
		winner: null,
	};
}

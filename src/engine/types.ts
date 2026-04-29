/**
 * Canonical game-state types for Chonkers.
 *
 * Source of rules truth: docs/RULES.md. This module never validates;
 * it only describes. Validation lives in src/game/moves.ts.
 */

export type Color = "red" | "white";

export interface Piece {
	readonly color: Color;
}

/** A stack is bottom-up: stack[0] is the bottom, stack[length-1] is the top. */
export type Stack = ReadonlyArray<Piece>;

/** 9 columns × 11 rows. board[col][row] is null for an empty cell. */
export type Board = ReadonlyArray<ReadonlyArray<Stack | null>>;

export interface Cell {
	readonly col: number;
	readonly row: number;
}

/**
 * A pending split chain forces the next move(s) to continue placing
 * pieces detached from the source stack. Each inner array is a
 * contiguous run of stack indices that must be moved as one sub-stack.
 */
export interface SplitChain {
	readonly source: Cell;
	readonly remainingDetachments: ReadonlyArray<ReadonlyArray<number>>;
}

export interface GameState {
	readonly board: Board;
	readonly turn: Color;
	readonly chain: SplitChain | null;
	readonly winner: Color | null;
}

export type Action =
	| { readonly type: "move"; readonly from: Cell; readonly to: Cell }
	| {
			readonly type: "split";
			readonly from: Cell;
			readonly to: Cell;
			readonly sliceIndices: ReadonlyArray<number>;
	  };

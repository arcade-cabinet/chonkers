/**
 * Board mutators. Pure functions over `Board` (Map<bigint, Piece>);
 * each function returns a NEW board rather than mutating the input.
 *
 * Higher-level move/split logic lives in `./moves.ts` — this file
 * only knows how to add, remove, and lift pieces; it doesn't decide
 * legality or detect chain transitions.
 */

import {
	type Board,
	type Cell,
	type Color,
	type Piece,
	positionKey,
	type Stack,
} from "./types";

/**
 * Materialise the stack at `(col, row)` from a `Board`. Returns the
 * pieces sorted by ascending height (bottom-first). Empty if no
 * pieces exist at that cell.
 */
export function materializeStack(board: Board, cell: Cell): Stack {
	const out: Piece[] = [];
	for (const piece of board.values()) {
		if (piece.col === cell.col && piece.row === cell.row) {
			out.push(piece);
		}
	}
	out.sort((a, b) => a.height - b.height);
	return out;
}

/**
 * Top-of-stack piece at `(col, row)`, or null if empty. The top
 * piece's colour is who "owns" the cell (RULES.md §1).
 */
export function topPieceAt(board: Board, cell: Cell): Piece | null {
	let top: Piece | null = null;
	for (const piece of board.values()) {
		if (piece.col === cell.col && piece.row === cell.row) {
			if (top === null || piece.height > top.height) {
				top = piece;
			}
		}
	}
	return top;
}

/** Stack height at `(col, row)`. 0 means empty. */
export function stackHeight(board: Board, cell: Cell): number {
	let h = 0;
	for (const piece of board.values()) {
		if (piece.col === cell.col && piece.row === cell.row) h += 1;
	}
	return h;
}

/** Empty board. */
export function emptyBoard(): Board {
	return new Map<bigint, Piece>();
}

/** Insert a piece at the given (col, row, height). Returns new board. */
export function setPiece(board: Board, piece: Piece): Board {
	const out = new Map(board);
	out.set(positionKey(piece.col, piece.row, piece.height), piece);
	return out;
}

/** Remove the piece at (col, row, height). Returns new board. */
export function removePieceAt(
	board: Board,
	col: number,
	row: number,
	height: number,
): Board {
	const out = new Map(board);
	out.delete(positionKey(col, row, height));
	return out;
}

/**
 * Place a sub-stack on top of the destination cell. The sub-stack's
 * piece order is preserved bottom-up; existing pieces at `to` are
 * left untouched, and the sub-stack's heights are renumbered to
 * start at the destination's current stack height.
 *
 * `subStack` is the sub-stack as bottom-up colours (the moving
 * stack's perspective), NOT pre-positioned pieces. We re-stamp
 * coordinates here.
 */
export function placeSubStack(
	board: Board,
	to: Cell,
	subStackColors: ReadonlyArray<Color>,
): Board {
	const baseHeight = stackHeight(board, to);
	let out = board;
	for (let i = 0; i < subStackColors.length; i += 1) {
		const color = subStackColors[i] as Color;
		out = setPiece(out, {
			col: to.col,
			row: to.row,
			height: baseHeight + i,
			color,
		});
	}
	return out;
}

/**
 * Remove the slice indices from the source cell's stack. `indices`
 * are TOP-DOWN per RULES.md §5.1 (0 = topmost piece). Returns:
 *   - newBoard with those pieces removed
 *   - removed: the colours of the detached pieces, ordered BOTTOM-UP
 *     within their original stack positions, so callers can reuse
 *     them as `placeSubStack(..., removed)` to preserve dominance.
 *   - residualHeight: the new height of the source stack
 */
export function detachSlices(
	board: Board,
	source: Cell,
	topDownIndices: ReadonlyArray<number>,
): { board: Board; removed: ReadonlyArray<Color>; residualHeight: number } {
	const stack: Stack = materializeStack(board, source);
	const h = stack.length;
	if (h === 0) {
		return { board, removed: [], residualHeight: 0 };
	}
	// Convert top-down → bottom-up height indices.
	const detachedHeights = new Set(topDownIndices.map((i) => h - 1 - i));

	let out = board;
	const removedBottomUp: Color[] = [];
	for (let height = 0; height < h; height += 1) {
		if (detachedHeights.has(height)) {
			const piece = stack[height] as Piece;
			out = removePieceAt(out, source.col, source.row, height);
			removedBottomUp.push(piece.color);
		}
	}

	// Compact the residual stack: any piece above a removed slot
	// drops down to fill the gap so heights stay contiguous from 0.
	const survivors: Piece[] = [];
	for (let height = 0; height < h; height += 1) {
		if (!detachedHeights.has(height)) {
			survivors.push(stack[height] as Piece);
		}
	}
	for (let height = 0; height < h; height += 1) {
		out = removePieceAt(out, source.col, source.row, height);
	}
	for (let newHeight = 0; newHeight < survivors.length; newHeight += 1) {
		const p = survivors[newHeight] as Piece;
		out = setPiece(out, {
			col: source.col,
			row: source.row,
			height: newHeight,
			color: p.color,
		});
	}

	return {
		board: out,
		removed: removedBottomUp,
		residualHeight: survivors.length,
	};
}

/**
 * Player-colour ownership of a cell: the top piece's colour, or null
 * if the cell is empty.
 */
export function cellOwner(board: Board, cell: Cell): Color | null {
	let topHeight = -1;
	let topColor: Color | null = null;
	for (const piece of board.values()) {
		if (
			piece.col === cell.col &&
			piece.row === cell.row &&
			piece.height > topHeight
		) {
			topHeight = piece.height;
			topColor = piece.color;
		}
	}
	return topColor;
}

/**
 * All cells whose top-of-stack the given player owns. Used by the AI
 * + analytics + win check.
 */
export function ownedCells(board: Board, player: Color): ReadonlyArray<Cell> {
	const seen = new Map<string, { topHeight: number; color: Color }>();
	for (const piece of board.values()) {
		const k = `${piece.col}:${piece.row}`;
		const prev = seen.get(k);
		if (!prev || piece.height > prev.topHeight) {
			seen.set(k, { topHeight: piece.height, color: piece.color });
		}
	}
	const out: Cell[] = [];
	for (const [k, v] of seen) {
		if (v.color === player) {
			const [col, row] = k.split(":").map(Number);
			out.push({ col: col as number, row: row as number });
		}
	}
	return out;
}

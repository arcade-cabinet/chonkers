/**
 * Pure position math. No PRNG, no rules logic — just Cell algebra.
 *
 * The 9×11 grid is described in docs/RULES.md §2. Coords use
 * (col, row) with col in [0, 8] and row in [0, 10].
 *
 * `posToVector3` / `vector3ToPos` map between the abstract grid and
 * a structural `{x, y, z}` shape compatible with both `THREE.Vector3`
 * and `yuka.Vector3` (and any plain object literal). No library type
 * is imported here — the engine doesn't depend on a particular
 * Vector3 implementation, so neither the canvas (which uses Three.js)
 * nor the AI (which historically used yuka, currently doesn't reach
 * this surface) needs an adapter when consuming the result.
 */

import { tokens } from "@/design/tokens";
import type { Cell } from "./types";

const { cols, rows, cellSize } = tokens.board;

export const BOARD_COLS = cols;
export const BOARD_ROWS = rows;
export const RED_HOME_ROW = 0;
export const WHITE_HOME_ROW = rows - 1;

/**
 * Minimal structural Vector3 shape. Both `THREE.Vector3` and
 * `yuka.Vector3` extend this — callers can pass either or a plain
 * object literal.
 */
export interface Vector3Like {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

/** Convert a board cell to a `{x, y, z}` triple. Y is the board surface (0). */
export function posToVector3(cell: Cell): Vector3Like {
	const x = (cell.col - (cols - 1) / 2) * cellSize;
	const z = (cell.row - (rows - 1) / 2) * cellSize;
	return { x, y: 0, z };
}

/**
 * Convert a `{x, y, z}` triple (THREE.Vector3, yuka.Vector3, or a
 * plain object literal) back to the closest board cell. The result
 * is clamped to the board's [0, cols-1] × [0, rows-1] range so a
 * vector well off the board still snaps to the nearest legal cell —
 * callers who need to detect off-board input can compare the
 * unclamped projection against the result.
 */
export function vector3ToPos(v: Vector3Like): Cell {
	const col = Math.max(
		0,
		Math.min(cols - 1, Math.round(v.x / cellSize + (cols - 1) / 2)),
	);
	const row = Math.max(
		0,
		Math.min(rows - 1, Math.round(v.z / cellSize + (rows - 1) / 2)),
	);
	return { col, row };
}

export function cellsEqual(a: Cell, b: Cell): boolean {
	return a.col === b.col && a.row === b.row;
}

/** Chebyshev distance — 1 means a legal one-step move (orthogonal or diagonal). */
export function chebyshevDistance(a: Cell, b: Cell): number {
	return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function isOnBoard(cell: Cell): boolean {
	return cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows;
}

/** Eight adjacency offsets (orthogonal + diagonal) per RULES.md §4.1. */
export const ADJACENT_OFFSETS: ReadonlyArray<Cell> = [
	{ col: -1, row: -1 },
	{ col: 0, row: -1 },
	{ col: 1, row: -1 },
	{ col: -1, row: 0 },
	{ col: 1, row: 0 },
	{ col: -1, row: 1 },
	{ col: 0, row: 1 },
	{ col: 1, row: 1 },
];

/** Cells reachable from `from` in one step (clipped to the board). */
export function adjacentCells(from: Cell): ReadonlyArray<Cell> {
	const out: Cell[] = [];
	for (const off of ADJACENT_OFFSETS) {
		const c: Cell = { col: from.col + off.col, row: from.row + off.row };
		if (isOnBoard(c)) out.push(c);
	}
	return out;
}

/** The opponent's home row for a given player colour. */
export function opponentHomeRow(player: "red" | "white"): number {
	return player === "red" ? WHITE_HOME_ROW : RED_HOME_ROW;
}

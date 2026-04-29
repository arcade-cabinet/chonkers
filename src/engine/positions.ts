/**
 * Pure position math. No PRNG, no rules logic — just Cell algebra.
 *
 * The 9×11 grid is described in docs/RULES.md §2. Coords use
 * (col, row) with col in [0, 8] and row in [0, 10].
 *
 * `posToVector3` / `vector3ToPos` exist for the AI's Yuka Graph
 * state-space model (Yuka uses Vector3 for graph nodes), and for
 * the R3F render layer's eventual world-space transform.
 */

import { Vector3 } from "yuka";
import { tokens } from "@/design/tokens";
import type { Cell } from "./types";

const { cols, rows, cellSize } = tokens.board;

export const BOARD_COLS = cols;
export const BOARD_ROWS = rows;
export const RED_HOME_ROW = 0;
export const WHITE_HOME_ROW = rows - 1;

/** Convert a board cell to a Yuka Vector3. Y is the board surface (0). */
export function posToVector3(cell: Cell): Vector3 {
	const x = (cell.col - (cols - 1) / 2) * cellSize;
	const z = (cell.row - (rows - 1) / 2) * cellSize;
	return new Vector3(x, 0, z);
}

/** Convert a Yuka Vector3 back to the closest board cell. */
export function vector3ToPos(v: Vector3): Cell {
	const col = Math.round(v.x / cellSize + (cols - 1) / 2);
	const row = Math.round(v.z / cellSize + (rows - 1) / 2);
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

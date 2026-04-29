import { tokens } from "@/design/tokens";
import type { Cell } from "./types";

const { cols, rows, cellSize } = tokens.board;

/** Convert a board cell to its world-space (x, z) centre. Y is the board surface. */
export function cellToWorld(cell: Cell): { x: number; z: number } {
	// Centre the board on origin; col axis = X, row axis = Z.
	const x = (cell.col - (cols - 1) / 2) * cellSize;
	const z = (cell.row - (rows - 1) / 2) * cellSize;
	return { x, z };
}

export function isOnBoard(cell: Cell): boolean {
	return cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows;
}

export function cellsEqual(a: Cell, b: Cell): boolean {
	return a.col === b.col && a.row === b.row;
}

/** Chebyshev distance — 1 means a legal one-step move (orthogonal or diagonal). */
export function chebyshevDistance(a: Cell, b: Cell): number {
	return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

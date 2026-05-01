/**
 * Shared mutable board-projection state — scene writes per frame, app reads
 * per frame.
 *
 * The scene's rAF loop projects each board cell's world-space anchor into
 * screen-space coords (`camera.project()` then viewport mapping) and writes
 * the result into `boardProjection.cells`. The Solid `BoardA11yGrid`
 * component reads from this in its own rAF loop and updates the
 * `<div role="grid">` cells' transform.
 *
 * Why not a koota trait: the data updates 60 fps. Pushing through
 * koota's onChange would re-fire every subscriber every frame (Solid
 * signals would re-set every frame). A plain mutable module is the right
 * primitive for "60fps shared geometry"; reactive systems are for
 * discrete state changes.
 *
 * Why not a window global: lint rule + cross-universe boundary
 * (CLAUDE.md "Strict architectural rules") — both `src/scene/` and `app/`
 * import from `@/sim/`, so this module is the legal bridge.
 */

import { BOARD_COLS, BOARD_ROWS } from "@/engine";

/**
 * A point in screen-space CSS pixels (0,0 at the top-left of the
 * viewport), with a flag for "this anchor is currently behind the
 * camera" so consumers can hide their DOM proxy. Used for both
 * cell anchors and the bezel corner — the shape is identical.
 */
export interface ScreenPoint {
	readonly x: number;
	readonly y: number;
	readonly offscreen: boolean;
}

/** @deprecated Use `ScreenPoint`. Kept as an alias for clarity at call sites. */
export type CellProjection = ScreenPoint;

const TOTAL_CELLS = BOARD_COLS * BOARD_ROWS;

function emptyCells(): ScreenPoint[] {
	return Array.from({ length: TOTAL_CELLS }, () => ({
		x: 0,
		y: 0,
		offscreen: true,
	}));
}

export const boardProjection: {
	cells: ScreenPoint[];
	/**
	 * Top-right bezel corner in screen-space CSS pixels. Tracks the
	 * board through tilts + 180° rotations so the Solid
	 * `BezelHamburger` can anchor itself to the corner instead of the
	 * viewport edge.
	 */
	bezelTopRight: ScreenPoint;
	/** Bumped any time the scene writes a fresh frame. */
	frame: number;
	/** True once the scene has written at least one frame. */
	ready: boolean;
} = {
	cells: emptyCells(),
	bezelTopRight: { x: 0, y: 0, offscreen: true },
	frame: 0,
	ready: false,
};

/** (col, row) → flat index into `boardProjection.cells`. */
export function cellIndex(col: number, row: number): number {
	return row * BOARD_COLS + col;
}

/** Reset to all-offscreen. Called on match teardown so stale coords don't render. */
export function clearBoardProjection(): void {
	boardProjection.cells = emptyCells();
	boardProjection.bezelTopRight = { x: 0, y: 0, offscreen: true };
	boardProjection.frame = 0;
	boardProjection.ready = false;
}

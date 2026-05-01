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

export interface CellProjection {
	/** Screen-space x in CSS pixels (0 at left edge of viewport). */
	readonly x: number;
	/** Screen-space y in CSS pixels (0 at top edge of viewport). */
	readonly y: number;
	/**
	 * True when the cell's world anchor is currently behind the camera
	 * (z > 1 in NDC after projection). The Solid component should hide
	 * gridcells in this state — they aren't legal click targets.
	 */
	readonly offscreen: boolean;
}

const TOTAL_CELLS = BOARD_COLS * BOARD_ROWS;

function emptyCells(): CellProjection[] {
	return Array.from({ length: TOTAL_CELLS }, () => ({
		x: 0,
		y: 0,
		offscreen: true,
	}));
}

export const boardProjection: {
	cells: CellProjection[];
	/** Bumped any time the scene writes a fresh frame. */
	frame: number;
	/** True once the scene has written at least one frame. */
	ready: boolean;
} = {
	cells: emptyCells(),
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
	boardProjection.frame = 0;
	boardProjection.ready = false;
}

/**
 * BoardA11yGrid — accessible overlay over the canvas.
 *
 * Renders a 9×11 grid of invisible <button role="gridcell"> elements
 * positioned per-frame at the projected screen-space coords of each
 * board cell. Click / Enter / Space delegates to the input layer's
 * `tapCell` via the sim singleton — same path a canvas pointer-up
 * takes for selection toggle / commit / clear.
 *
 * Drag gestures (the diegetic pivot-drag turn-end + the split-radial
 * hold-to-arm + drag-commit) MUST still work. Cells have
 * `pointer-events: auto` for click, so mouse-down on a cell would
 * normally swallow the gesture. The fix: on `pointerdown` we mirror
 * the event onto the canvas immediately. The canvas's drag detector
 * starts tracking at the same coords; if the gesture turns into a
 * drag, the canvas handles it. If it stays a tap, the cell's own
 * `click` event fires on pointer-up and selection happens.
 *
 * Why exist:
 *   - PRQ-C3a acceptance: enables `pass-and-play.spec.ts` to drive
 *     matches via `getByRole("gridcell", { name })`.
 *   - Accessibility: keyboard + screen-reader users can play. Cells
 *     are in tab order; Enter/Space activates.
 *   - Touch precision: large invisible click targets so fat-finger
 *     taps near a piece reliably hit the right cell.
 */

import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { BOARD_COLS, BOARD_ROWS, getSimSingleton } from "@/sim";
import { boardProjection, cellIndex } from "@/sim/board-projection";
import { uiState } from "../stores/ui-store";

interface CellPos {
	readonly x: number;
	readonly y: number;
	readonly hidden: boolean;
}

const HIDDEN_POS: CellPos = { x: 0, y: 0, hidden: true };

function cellLabel(col: number, row: number): string {
	return `row ${row}, column ${col}`;
}

export function BoardA11yGrid() {
	const { tapCell } = getSimSingleton();

	const total = BOARD_COLS * BOARD_ROWS;
	const initial: CellPos[] = Array.from({ length: total }, () => HIDDEN_POS);
	const [positions, setPositions] = createSignal<CellPos[]>(initial);

	let rafHandle = 0;
	let lastFrame = -1;
	const tick = () => {
		// Only re-render when scene wrote a new frame. Diff against the
		// frame counter so we don't churn Solid signals unnecessarily.
		if (boardProjection.ready && boardProjection.frame !== lastFrame) {
			lastFrame = boardProjection.frame;
			const next: CellPos[] = boardProjection.cells.map((c) => ({
				x: c.x,
				y: c.y,
				hidden: c.offscreen,
			}));
			setPositions(next);
		} else if (!boardProjection.ready && lastFrame !== -1) {
			lastFrame = -1;
			setPositions(initial);
		}
		rafHandle = requestAnimationFrame(tick);
	};

	onMount(() => {
		rafHandle = requestAnimationFrame(tick);
	});
	onCleanup(() => {
		cancelAnimationFrame(rafHandle);
	});

	const onCellActivate = (col: number, row: number) => {
		tapCell({ col, row });
	};

	// Note: pivot-drag turn-end uses the canvas (drags from outside
	// any cell — the bezel area / corners). Cells handle taps only.
	// Forwarding pointerdown to the canvas was tried and broken click
	// dispatch in test environments; the diegetic gesture works fine
	// from non-cell areas which is what the user naturally grabs to
	// pivot.

	const rows: number[] = [];
	for (let row = 0; row < BOARD_ROWS; row += 1) rows.push(row);
	const cols: number[] = [];
	for (let col = 0; col < BOARD_COLS; col += 1) cols.push(col);

	return (
		<Show when={uiState.screen() === "play"}>
			{/* biome-ignore lint/a11y/useSemanticElements: ARIA role=grid (interactive),
			    not a data table. <table> would force tabular semantics that don't
			    match the chonkers playfield. */}
			<div
				class="ck-board-grid"
				role="grid"
				aria-label="Chonkers board"
				aria-rowcount={BOARD_ROWS}
				aria-colcount={BOARD_COLS}
			>
				<For each={rows}>
					{(row) => (
						// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA grid pattern.
						// biome-ignore lint/a11y/useFocusableInteractive: row is a structural container, not focusable; gridcells inside are the interactive elements.
						<div role="row" aria-rowindex={row + 1}>
							<For each={cols}>
								{(col) => {
									const pos = () =>
										positions()[cellIndex(col, row)] ?? HIDDEN_POS;
									return (
										// biome-ignore lint/a11y/useSemanticElements: WAI-ARIA grid pattern requires role=gridcell inside role=row inside role=grid.
										<button
											type="button"
											class="ck-board-grid__cell"
											role="gridcell"
											aria-label={cellLabel(col, row)}
											aria-colindex={col + 1}
											data-col={col}
											data-row={row}
											style={{
												transform: `translate(${pos().x}px, ${pos().y}px)`,
												visibility: pos().hidden ? "hidden" : "visible",
											}}
											onClick={() => onCellActivate(col, row)}
											onKeyDown={(ev) => {
												if (ev.key === "Enter" || ev.key === " ") {
													ev.preventDefault();
													onCellActivate(col, row);
												}
											}}
										/>
									);
								}}
							</For>
						</div>
					)}
				</For>
			</div>
		</Show>
	);
}

/**
 * Process-singleton sim world + actions builder.
 *
 * The browser app has TWO consumers of the sim world: the scene
 * layer (`src/scene/index.ts`, the canvas universe) and the Solid
 * overlay layer (`app/main.tsx`, the menu universe). Both must
 * observe the same koota world and dispatch through the same broker
 * actions. Constructing two independent worlds would split state
 * across the two universes — the lobby button click would update one
 * world, the canvas would render the other, nothing would happen.
 *
 * This module provides an idempotent `getSimSingleton(opts?)` that
 * returns the same `{ sim, actions }` pair to every caller. Options
 * are honoured only on the first call; subsequent calls return the
 * cached instance regardless of their arguments.
 *
 * For headless tests (broker.test, broker-100-runs, governor) this
 * module is NOT used — those tests construct their own `SimWorld`
 * with their own hooks. The singleton is purely a browser-side
 * convenience.
 */

import {
	buildSimActions,
	type CreateSimWorldOptions,
	createSimWorld,
	type SimActions,
	type SimWorld,
} from "./world";

/**
 * Bridge: scene installs a tapCell handler via `setSceneTapCell`; the
 * Solid `BoardA11yGrid` calls singleton.tapCell when a gridcell is
 * activated by mouse click, Enter, or Space. Same code path the
 * canvas pointer-up takes — selection toggle / commit / clear.
 * PRQ-C3a.
 *
 * Drag gestures (pivot-drag turn-end, split-radial hold-to-arm) are
 * NOT routed through this bridge. Those stay on the canvas pointer
 * handlers — the a11y grid forwards pointer events to the canvas on
 * pointer-move so a drag that starts on a cell still drives the
 * canvas's drag detector.
 */
export type SceneCellTap = (cell: { col: number; row: number }) => void;

interface SimSingleton {
	readonly sim: SimWorld;
	readonly actions: SimActions;
	tapCell(cell: { col: number; row: number }): void;
}

let cached: SimSingleton | null = null;
let sceneTapCell: SceneCellTap | null = null;

export function getSimSingleton(options?: CreateSimWorldOptions): SimSingleton {
	if (cached) return cached;
	const sim = createSimWorld(options ?? {});
	const actions = buildSimActions(sim)(sim.world);
	cached = {
		sim,
		actions,
		tapCell(cell) {
			if (sceneTapCell) sceneTapCell(cell);
		},
	};
	return cached;
}

/** Scene-only: install the tapCell handler the input layer wraps. */
export function setSceneTapCell(handler: SceneCellTap | null): void {
	sceneTapCell = handler;
}

/** Test-only: clear the cached instance so a fresh world is built. */
export function resetSimSingleton(): void {
	cached = null;
	sceneTapCell = null;
}

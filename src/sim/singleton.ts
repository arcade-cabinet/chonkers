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

interface SimSingleton {
	readonly sim: SimWorld;
	readonly actions: SimActions;
}

let cached: SimSingleton | null = null;

export function getSimSingleton(options?: CreateSimWorldOptions): SimSingleton {
	if (cached) return cached;
	const sim = createSimWorld(options ?? {});
	const actions = buildSimActions(sim)(sim.world);
	cached = { sim, actions };
	return cached;
}

/** Test-only: clear the cached instance so a fresh world is built. */
export function resetSimSingleton(): void {
	cached = null;
}

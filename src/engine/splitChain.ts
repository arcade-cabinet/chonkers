/**
 * Forced-split chain helpers.
 *
 * The chain state machine is documented in RULES.md §5.4. The
 * reducer in `./moves.ts` advances the chain on every action; this
 * module exposes pure predicates over a `GameState` so the UI / AI
 * can introspect chain status without simulating actions.
 */

import { stackHeight } from "./board";
import { adjacentCells } from "./positions";
import type { GameState } from "./types";

/** True iff a forced-split chain is in progress. */
export function isChainActive(state: GameState): boolean {
	return state.chain !== null;
}

/**
 * The slice indices the player MUST place this turn (the head
 * detachment of the chain), or null if no chain is active.
 */
export function chainNextDetachment(
	state: GameState,
): ReadonlyArray<number> | null {
	if (!state.chain) return null;
	return state.chain.remainingDetachments[0] ?? null;
}

/**
 * True iff at least one legal destination exists for the chain's
 * head detachment. Per RULES.md §5.4.1, when the chain owner's retry
 * has no legal destination the chain dies — the residual stays put,
 * the chain field clears, control flips.
 */
export function chainHasLegalContinuation(state: GameState): boolean {
	if (!state.chain) return false;
	const head = state.chain.remainingDetachments[0];
	if (!head) return false;
	const subHeight = head.length;
	for (const to of adjacentCells(state.chain.source)) {
		const destHeight = stackHeight(state.board, to);
		if (destHeight === 0 || subHeight <= destHeight) return true;
	}
	return false;
}

/**
 * Number of detachments still owed by the chain (including the
 * head). 0 when no chain is active.
 */
export function chainRemainingCount(state: GameState): number {
	return state.chain ? state.chain.remainingDetachments.length : 0;
}

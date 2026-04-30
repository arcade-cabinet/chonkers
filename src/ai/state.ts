/**
 * AI-side opaque state per docs/AI.md "State representation".
 *
 * The transposition table is a perf cache; it does not affect
 * `chooseAction` outcomes (the determinism contract). The
 * `searchTreeCache` is similarly informational — `./search.ts` may
 * use it to seed move ordering for the next turn.
 */

import type { ProfileKey } from "./profiles";

/**
 * Transposition table entry. Keyed by the Zobrist hash of the board
 * + side-to-move; the value is the search result at the depth it
 * was computed.
 */
export interface TranspositionEntry {
	readonly hash: bigint;
	readonly depth: number;
	readonly score: number;
	readonly flag: "exact" | "lowerBound" | "upperBound";
	readonly bestMoveIndex: number; // index into the legal-action list at the time
}

export type TranspositionTable = Map<bigint, TranspositionEntry>;

export interface AiState {
	readonly profileKey: ProfileKey;
	readonly transpositionTable: TranspositionTable;
	/** Last known chain detachment plan, if any. Informational. */
	readonly chainPlannedRemainder: ReadonlyArray<readonly number[]> | null;
}

export function createAiState(profileKey: ProfileKey): AiState {
	return {
		profileKey,
		transpositionTable: new Map(),
		chainPlannedRemainder: null,
	};
}

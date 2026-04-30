/**
 * Evaluation function for chonkers per docs/AI.md.
 *
 * `evaluate(state, profile, player) → number` is the leaf-node
 * scoring used by `./search.ts`. Higher = better for `player`.
 *
 * This is a pure function of (state, profile, player) — no PRNG,
 * no IO, no caches that change semantics. The transposition table
 * in `./state.ts` caches eval results but is keyed by the Zobrist
 * hash, so cache hits do not introduce nondeterminism.
 */

import type { Color, GameState } from "@/engine";
import { playerSatisfiesWin } from "@/engine";
import { computeFeatures } from "./features";
import type { Profile } from "./profiles";

/**
 * Score from `player`'s perspective. Wins / losses are short-
 * circuited to ±∞ values so the search prefers winning moves and
 * avoids losing moves regardless of feature weights.
 */
export function evaluate(
	state: GameState,
	profile: Profile,
	player: Color,
): number {
	// Terminal: trust the explicit winner field, then fall back to
	// computing it from the board. We compute the per-side
	// satisfaction directly rather than calling `resolveWinner`,
	// which baked the moving-player tie-break into its return value
	// — that's correct for the reducer but PERSPECTIVE-DEPENDENT and
	// would let two evaluator calls on the same unstamped board
	// disagree about who won. Here we only short-circuit when
	// EXACTLY ONE side satisfies; an ambiguous board (both sides or
	// neither) falls through to the feature sum.
	const terminal =
		state.winner ??
		(() => {
			const redWin = playerSatisfiesWin(state.board, "red");
			const whiteWin = playerSatisfiesWin(state.board, "white");
			if (redWin === whiteWin) return null;
			return redWin ? "red" : "white";
		})();
	if (terminal === player) return TERMINAL_WIN_SCORE;
	if (terminal !== null && terminal !== player) return -TERMINAL_WIN_SCORE;

	const f = computeFeatures(state, player);
	const w = profile.weights;
	return (
		f.forward_progress * w.forward_progress +
		f.top_count * w.top_count +
		f.home_row_tops * w.home_row_tops +
		f.chonk_opportunities * w.chonk_opportunities +
		f.tall_stack_count * w.tall_stack_count +
		f.blocker_count * w.blocker_count +
		f.chain_owed * w.chain_owed +
		f.opponent_forward_progress * w.opponent_forward_progress +
		f.opponent_home_row_tops * w.opponent_home_row_tops +
		f.opponent_tall_stacks_unblocked * w.opponent_tall_stacks_unblocked
	);
}

/**
 * The score a confirmed win is worth. Larger than any feature-sum
 * outcome by at least an order of magnitude; minimax never returns
 * a non-terminal score this high.
 */
export const TERMINAL_WIN_SCORE = 1_000_000;

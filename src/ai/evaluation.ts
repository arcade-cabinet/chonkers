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
import { resolveWinner } from "@/engine";
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
	// computing it from the board (in case the search hands us a
	// board that hasn't yet had resolveWinner stamped on it).
	const terminal = state.winner ?? resolveWinner(state.board, player);
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

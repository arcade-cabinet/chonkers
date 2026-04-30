/**
 * Alpha-beta minimax search per docs/AI.md.
 *
 * Two execution modes per the determinism contract:
 *   - `live`   — iterative deepening, capped by `time_budget_ms`.
 *                Host-speed-dependent. Production live play.
 *   - `replay` — pinned to `profile.knobs.search_depth`. Host-
 *                independent. Used by every governor stage.
 *
 * The function is intentionally pure with respect to the AI state:
 * it READS from `aiState.transpositionTable` (cache hit-miss is the
 * only side-effect on AI state, and it never affects the chosen
 * action). The caller folds any TT mutations into the next AiState.
 */

import {
	type Action,
	applyAction,
	type Color,
	enumerateLegalActions,
	type GameState,
	hashGameState,
} from "@/engine";
import { evaluate, TERMINAL_WIN_SCORE } from "./evaluation";
import type { Profile } from "./profiles";
import type { AiState } from "./state";

export type SearchMode = "live" | "replay";

/**
 * Hard cap on transposition-table size. Hit at ~1M entries the table
 * is wiped (see alphaBeta). V8's Map has a hard ceiling around 2^24
 * = 16,777,216 entries; the 1000-run beta governor observed a
 * RangeError on hard-vs-hard at depth 6+ in long games, so the cap
 * sits well below that with headroom for memory pressure on mobile.
 *
 * Exported so the unit test can witness the cap rather than guessing.
 */
export const TT_MAX_ENTRIES = 1_000_000;

export interface SearchResult {
	readonly action: Action | null;
	readonly score: number;
	readonly depthReached: number;
	readonly nodesExplored: number;
}

interface SearchContext {
	readonly profile: Profile;
	readonly player: Color;
	readonly mode: SearchMode;
	readonly deadlineMs: number;
	readonly aiState: AiState;
	nodesExplored: number;
	deadlineHit: boolean;
}

/**
 * Top-level search entry. Returns the best action found within the
 * mode's bounds.
 */
export function search(
	state: GameState,
	profile: Profile,
	player: Color,
	mode: SearchMode,
	aiState: AiState,
	now: () => number = Date.now,
): SearchResult {
	const ctx: SearchContext = {
		profile,
		player,
		mode,
		deadlineMs:
			mode === "live"
				? now() + profile.knobs.time_budget_ms
				: Number.POSITIVE_INFINITY,
		aiState,
		nodesExplored: 0,
		deadlineHit: false,
	};

	const targetDepth = profile.knobs.search_depth;

	if (mode === "replay") {
		// Single fixed-depth search. Host-speed-independent.
		const best = searchAtDepth(state, ctx, targetDepth, now);
		return {
			action: best.action,
			score: best.score,
			depthReached: targetDepth,
			nodesExplored: ctx.nodesExplored,
		};
	}

	// Live: iterative deepening. Seed `lastBest` with the first
	// legal action so a tight clock that expires before depth-1
	// completes still returns a legal move rather than null. Without
	// this seed, `chooseAction` would interpret the null as
	// `stalled`/`forfeit` and skip a legal move.
	const rootActions = enumerateLegalActions(state);
	const fallback = rootActions[0] ?? null;
	let lastBest: SearchResult = {
		action: fallback,
		score: 0,
		depthReached: 0,
		nodesExplored: 0,
	};
	for (let depth = 1; depth <= targetDepth; depth += 1) {
		if (now() >= ctx.deadlineMs) break;
		const best = searchAtDepth(state, ctx, depth, now);
		// If the deadline was hit mid-search, do not commit the partial
		// result for this depth; keep the previous fully-completed
		// result (or the seeded fallback if depth-1 didn't finish).
		if (ctx.deadlineHit) break;
		lastBest = {
			action: best.action,
			score: best.score,
			depthReached: depth,
			nodesExplored: ctx.nodesExplored,
		};
	}
	return lastBest;
}

interface DepthResult {
	action: Action | null;
	score: number;
}

function searchAtDepth(
	state: GameState,
	ctx: SearchContext,
	depth: number,
	now: () => number,
): DepthResult {
	const actions = enumerateLegalActions(state);
	if (actions.length === 0) {
		return { action: null, score: evaluate(state, ctx.profile, ctx.player) };
	}

	let bestAction: Action | null = actions[0] ?? null;
	let bestScore = -Number.POSITIVE_INFINITY;
	let alpha = -Number.POSITIVE_INFINITY;
	const beta = Number.POSITIVE_INFINITY;

	// Order moves: prefer the previous-turn's transposition-table entry
	// for the root node. Stable ordering in the absence of a hint —
	// `enumerateLegalActions` is deterministic.
	const ordered = orderActionsForRoot(actions, state, ctx);

	for (const action of ordered) {
		if (ctx.mode === "live" && now() >= ctx.deadlineMs) {
			ctx.deadlineHit = true;
			break;
		}
		const next = applyAction(state, action);
		const score = -alphaBeta(next, ctx, depth - 1, -beta, -alpha, now);
		if (score > bestScore) {
			bestScore = score;
			bestAction = action;
		}
		if (score > alpha) alpha = score;
		if (alpha >= beta) break;
	}

	return { action: bestAction, score: bestScore };
}

function alphaBeta(
	state: GameState,
	ctx: SearchContext,
	depth: number,
	alpha: number,
	beta: number,
	now: () => number,
): number {
	ctx.nodesExplored += 1;

	if (ctx.mode === "live" && now() >= ctx.deadlineMs) {
		ctx.deadlineHit = true;
		// Score from the side-to-move's perspective so the negamax
		// recursion stays consistent — using ctx.player here flips
		// the sign every other ply, biasing partial-search scores
		// arbitrarily.
		return evaluate(state, ctx.profile, sideToMove(state, ctx.player));
	}

	if (state.winner) {
		// Terminal: exact win/loss score from the perspective of the
		// side TO MOVE at this node (negamax).
		return state.winner === sideToMove(state, ctx.player)
			? TERMINAL_WIN_SCORE
			: -TERMINAL_WIN_SCORE;
	}

	if (depth === 0) {
		return evaluate(state, ctx.profile, sideToMove(state, ctx.player));
	}

	const ttKey = hashGameState(state);
	const cached = ctx.aiState.transpositionTable.get(ttKey);
	if (cached && cached.depth >= depth) {
		if (cached.flag === "exact") return cached.score;
		if (cached.flag === "lowerBound" && cached.score >= beta)
			return cached.score;
		if (cached.flag === "upperBound" && cached.score <= alpha)
			return cached.score;
	}

	const actions = enumerateLegalActions(state);
	if (actions.length === 0) {
		return evaluate(state, ctx.profile, sideToMove(state, ctx.player));
	}

	const ordered = orderActions(actions, state, ctx);

	let best = -Number.POSITIVE_INFINITY;
	let alphaLocal = alpha;
	for (const action of ordered) {
		const next = applyAction(state, action);
		const score = -alphaBeta(next, ctx, depth - 1, -beta, -alphaLocal, now);
		if (score > best) best = score;
		if (best > alphaLocal) alphaLocal = best;
		if (alphaLocal >= beta) break;
	}

	// Store TT entry. Skip the write if the deadline was hit during
	// this subtree — otherwise we'd cache a value that came from an
	// incomplete search, biasing future move selection.
	if (!ctx.deadlineHit) {
		const flag: TTFlag =
			best <= alpha ? "upperBound" : best >= beta ? "lowerBound" : "exact";
		const tt = ctx.aiState.transpositionTable;
		// Bounded TT: at-cap, drop the whole table and let it refill.
		// Why a clear instead of LRU eviction: the TT is a perf hint,
		// not part of the determinism contract (per docs/AI.md, dumps
		// don't serialise it). A clear is O(1) amortised + keeps this
		// hot path branchless except for the cap check, where LRU
		// would add bookkeeping per insert. The 1000-run governor
		// observed V8's Map size limit (~16M) blowing up mid-match in
		// hard-vs-hard at depth 6+ — capping at 1M keeps each match
		// well under that ceiling.
		if (tt.size >= TT_MAX_ENTRIES) {
			tt.clear();
		}
		tt.set(ttKey, {
			hash: ttKey,
			depth,
			score: best,
			flag,
			bestMoveIndex: 0,
		});
	}

	return best;
}

type TTFlag = "exact" | "lowerBound" | "upperBound";

function sideToMove(state: GameState, originalPlayer: Color): Color {
	return state.turn === originalPlayer ? originalPlayer : flip(originalPlayer);
}

function flip(c: Color): Color {
	return c === "red" ? "white" : "red";
}

/**
 * Stable, deterministic move ordering. Profile's prune_aggression
 * (currently unused) could be plumbed here later to drop the
 * tail of the ordered list at search time.
 */
function orderActions(
	actions: ReadonlyArray<Action>,
	_state: GameState,
	_ctx: SearchContext,
): ReadonlyArray<Action> {
	return actions;
}

function orderActionsForRoot(
	actions: ReadonlyArray<Action>,
	_state: GameState,
	_ctx: SearchContext,
): ReadonlyArray<Action> {
	return actions;
}

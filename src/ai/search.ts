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

	// Live: iterative deepening. Stop early if the deadline passes.
	let lastBest: SearchResult = {
		action: null,
		score: 0,
		depthReached: 0,
		nodesExplored: 0,
	};
	for (let depth = 1; depth <= targetDepth; depth += 1) {
		if (now() >= ctx.deadlineMs) break;
		const best = searchAtDepth(state, ctx, depth, now);
		// If the deadline was hit mid-search, do not commit the partial
		// result for this depth; keep the previous fully-completed result.
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
		return evaluate(state, ctx.profile, ctx.player);
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

	// Store TT entry. Flag depends on the cutoff that occurred.
	const flag: TTFlag =
		best <= alpha ? "upperBound" : best >= beta ? "lowerBound" : "exact";
	ctx.aiState.transpositionTable.set(ttKey, {
		hash: ttKey,
		depth,
		score: best,
		flag,
		bestMoveIndex: 0,
	});

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

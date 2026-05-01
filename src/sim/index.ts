/**
 * src/sim — actions broker for chonkers.
 *
 * The broker routes between engine + ai. It owns the per-match
 * `coin_flip_seed` (the only entropy source in the entire game).
 *
 * Persistence is the caller's concern: pass `onPlyCommit` /
 * `onMatchEnd` hooks to `createSimWorld` to wire the active-match
 * KV slot (see @/persistence/preferences/match).
 *
 * The scene layer (src/scene/) wraps this with koota traits for
 * live UI subscription. The broker itself is headless and node-
 * runnable so the alpha-stage 100-run gate (Tier 1, no UI) can drive
 * it directly.
 */

// Re-export pure render helpers + types from @/engine so the scene
// layer never has to reach into engine directly. These are stateless
// math functions / types — no broker bypass risk.
export {
	type Action,
	adjacentCells,
	BOARD_COLS,
	BOARD_ROWS,
	type Cell,
	type Color,
	cellsEqual,
	posToVector3,
	type Run,
	vector3ToPos,
} from "@/engine";
export {
	applyHumanAction,
	type CreateMatchOptions,
	createMatch,
	type MatchHandle,
	type PlayOptions,
	type PlayTurnResult,
	playToCompletion,
	playTurn,
} from "./broker";
export { decideFirstPlayer, freshCoinFlipSeed } from "./coinFlip";
export { getSimSingleton, resetSimSingleton } from "./singleton";
export {
	AiThinking,
	FALLBACK_PIECES,
	HoldProgress,
	type HumanColor,
	Match,
	type MatchSnapshot,
	type PiecePlacement,
	piecesFromBoard,
	Screen,
	type ScreenKind,
	Selection,
	type SelectionSnapshot,
	type SplitChainSnapshot,
	SplitChainView,
} from "./traits";
export {
	buildSimActions,
	type CreateSimWorldOptions,
	createSimWorld,
	type NewMatchInput,
	type SimActions,
	type SimActionsBuilder,
	type SimWorld,
} from "./world";

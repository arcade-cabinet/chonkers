/**
 * src/sim — actions broker for chonkers.
 *
 * The broker routes between engine + ai + store + persistence/sqlite +
 * analytics. It owns the per-match `coin_flip_seed` (the only entropy
 * source in the entire game) and the save/resume routing for AI
 * dump_blobs.
 *
 * The visual shell (PRQ-4) wraps this with koota traits for live
 * UI subscription. The broker itself is headless and node-runnable
 * so the alpha-stage 100-run gate (Tier 1, no UI) can drive it
 * directly.
 */

// Re-export pure render helpers + types from @/engine so app/* never
// has to reach into engine directly. These are stateless math
// functions / types — no broker bypass risk.
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
	saveMatchProgress,
} from "./broker";
export { decideFirstPlayer, freshCoinFlipSeed } from "./coinFlip";
export {
	AiThinking,
	Ceremony,
	type CeremonyPhase,
	type CeremonySnapshot,
	FALLBACK_PIECES,
	HoldProgress,
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
	SplitSelection,
	type SplitSelectionSnapshot,
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

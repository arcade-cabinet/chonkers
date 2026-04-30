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

export {
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

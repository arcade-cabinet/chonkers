/**
 * Sim broker — routes between engine + ai. Pure in-memory state
 * machine. Persistence is the caller's concern: pass `onPlyCommit` /
 * `onTerminal` hooks if you want to write `ActiveMatchSnapshot` to KV
 * after each ply. The 100-run alpha test runs without those hooks.
 *
 * Public API:
 *   - createMatch(options) → MatchHandle: builds the in-memory state.
 *   - playTurn(handle, options?): advances one ply; returns the
 *     decision + action + terminal flag.
 *   - playToCompletion(handle, options?): runs playTurn in a loop
 *     until winner is set or the per-match ply cap is hit.
 *   - applyHumanAction(handle, action): apply a human-committed
 *     action to the engine state. Throws IllegalActionError if the
 *     action is rejected by the engine.
 */

import {
	type AiState,
	chooseAction,
	createAiState,
	type Decision,
	getProfile,
	type ProfileKey,
} from "@/ai";
import {
	type Action,
	type Color,
	createInitialState,
	applyAction as engineApply,
	type GameState,
} from "@/engine";
import { decideFirstPlayer, freshCoinFlipSeed } from "./coinFlip";

export interface CreateMatchOptions {
	readonly redProfile: ProfileKey;
	readonly whiteProfile: ProfileKey;
	/** Override the coin-flip seed for replay scenarios. */
	readonly coinFlipSeed?: string;
	readonly matchId?: string;
}

export interface MatchHandle {
	readonly matchId: string;
	readonly redProfile: ProfileKey;
	readonly whiteProfile: ProfileKey;
	readonly coinFlipSeed: string;
	game: GameState;
	ai: { red: AiState; white: AiState };
	/** Action history — appended to on each successful ply. */
	actions: Action[];
}

export interface PlayTurnResult {
	readonly action: Action | null;
	readonly decision: Decision;
	readonly mover: Color;
	/** True iff the match transitioned to a terminal state on this turn. */
	readonly terminal: boolean;
	/** True iff this turn appended a move to handle.actions. */
	readonly persistedMove: boolean;
}

export interface PlayOptions {
	/** Stop the match if it exceeds this many plies (used by alpha governor). */
	readonly maxPlies?: number;
	/**
	 * Stop the match if more than this many consecutive stall flips
	 * happen without a persisted move. Defaults to `maxPlies`.
	 */
	readonly maxStalls?: number;
	/** Pass `replay` for governor runs; defaults to `live`. */
	readonly mode?: "live" | "replay";
	/**
	 * Optional terminal-transition hook. `playTurn` invokes this
	 * exactly once — when the match transitions to a finished state
	 * (forfeit or engine-declared winner) — passing the matchId.
	 */
	readonly onTerminal?: (matchId: string) => Promise<void> | void;
	/**
	 * Optional per-ply commit hook. Called after `handle.game` and
	 * `handle.actions` are updated for a successful ply. Wire this
	 * to `saveActiveMatch(snapshot)` from
	 * @/persistence/preferences/match for runtime persistence.
	 */
	readonly onPlyCommit?: (handle: MatchHandle) => Promise<void> | void;
}

/** Build a fresh match handle in memory. No persistence side effects. */
export function createMatch(options: CreateMatchOptions): MatchHandle {
	const matchId = options.matchId ?? crypto.randomUUID();
	const coinFlipSeed = options.coinFlipSeed ?? freshCoinFlipSeed();
	const firstPlayer = decideFirstPlayer(coinFlipSeed);
	const game = createInitialState(firstPlayer);

	return {
		matchId,
		redProfile: options.redProfile,
		whiteProfile: options.whiteProfile,
		coinFlipSeed,
		game,
		ai: {
			red: createAiState(options.redProfile),
			white: createAiState(options.whiteProfile),
		},
		actions: [],
	};
}

/**
 * Advance the match by one ply. Returns the resulting decision +
 * action + terminal flag. Mutates `handle.game` and `handle.actions`.
 */
export async function playTurn(
	handle: MatchHandle,
	options: PlayOptions = {},
): Promise<PlayTurnResult> {
	if (handle.game.winner) {
		return {
			action: null,
			decision: { kind: "stalled" },
			mover: handle.game.turn,
			terminal: true,
			persistedMove: false,
		};
	}

	const mover = handle.game.turn;
	const profileKey = mover === "red" ? handle.redProfile : handle.whiteProfile;
	const profile = getProfile(profileKey);
	const ai = mover === "red" ? handle.ai.red : handle.ai.white;
	const decision = chooseAction(handle.game, profile, mover, ai, {
		mode: options.mode ?? "live",
	});

	if (decision.kind === "forfeit") {
		handle.game = {
			...handle.game,
			winner: mover === "red" ? "white" : "red",
		};
		if (options.onTerminal) await options.onTerminal(handle.matchId);
		return {
			action: null,
			decision,
			mover,
			terminal: true,
			persistedMove: false,
		};
	}

	if (decision.kind === "stalled") {
		// Per RULES.md §5.4.1: a chain whose retry has no legal
		// destination dies — clear the chain and flip control.
		handle.game = {
			...handle.game,
			turn: mover === "red" ? "white" : "red",
			chain: null,
		};
		// Persist the post-stall state — `turn` flipped + `chain`
		// cleared is durable game state. If the app suspends after a
		// stalled flip and before the next real ply, the saved snapshot
		// would otherwise restore the wrong side / wrong chain.
		if (options.onPlyCommit) await options.onPlyCommit(handle);
		return {
			action: null,
			decision,
			mover,
			terminal: false,
			persistedMove: false,
		};
	}

	const action = decision.action;
	const next = engineApply(handle.game, action);
	handle.game = next;
	handle.actions.push(action);

	if (options.onPlyCommit) await options.onPlyCommit(handle);

	if (next.winner) {
		if (options.onTerminal) await options.onTerminal(handle.matchId);
		return { action, decision, mover, terminal: true, persistedMove: true };
	}

	return { action, decision, mover, terminal: false, persistedMove: true };
}

/**
 * Apply a HUMAN-committed action. Same engine reducer as `playTurn`,
 * but the action comes from input rather than the AI. Throws
 * `IllegalActionError` if the engine rejects it.
 */
export async function applyHumanAction(
	handle: MatchHandle,
	action: Action,
	options: PlayOptions = {},
): Promise<PlayTurnResult> {
	const mover = handle.game.turn;
	const next = engineApply(handle.game, action);
	handle.game = next;
	handle.actions.push(action);

	if (options.onPlyCommit) await options.onPlyCommit(handle);

	if (next.winner) {
		if (options.onTerminal) await options.onTerminal(handle.matchId);
		return {
			action,
			decision: { kind: "act", action, score: 0 },
			mover,
			terminal: true,
			persistedMove: true,
		};
	}

	return {
		action,
		decision: { kind: "act", action, score: 0 },
		mover,
		terminal: false,
		persistedMove: true,
	};
}

export interface PlayToCompletionResult {
	readonly outlier: boolean;
	readonly plies: number;
	readonly winner: Color | null;
	/** Cumulative stall flips across the match (diagnostic). */
	readonly stallCount: number;
}

const DEFAULT_MAX_PLIES = 1000;

export async function playToCompletion(
	handle: MatchHandle,
	options: PlayOptions = {},
): Promise<PlayToCompletionResult> {
	const maxPlies = options.maxPlies ?? DEFAULT_MAX_PLIES;
	const maxStalls = options.maxStalls ?? maxPlies;
	let plies = 0;
	let stallTotal = 0;
	let stallStreak = 0;

	while (true) {
		const result = await playTurn(handle, options);
		// Count the terminal ply itself before returning — winning
		// plies set BOTH `persistedMove` AND `terminal`, and skipping
		// the increment makes governor stats report one ply short.
		if (result.persistedMove) plies += 1;
		if (result.terminal) {
			return {
				outlier: false,
				plies,
				winner: handle.game.winner,
				stallCount: stallTotal,
			};
		}
		if (result.persistedMove) {
			// `maxStalls` bounds CONSECUTIVE stalled flips, not the
			// cumulative total — a successful ply ends the streak so
			// a few isolated stalls in a healthy match don't trip the
			// outlier guard.
			stallStreak = 0;
			if (plies >= maxPlies) {
				return {
					outlier: true,
					plies,
					winner: handle.game.winner,
					stallCount: stallTotal,
				};
			}
		} else {
			stallTotal += 1;
			stallStreak += 1;
			if (stallStreak >= maxStalls) {
				return {
					outlier: true,
					plies,
					winner: handle.game.winner,
					stallCount: stallTotal,
				};
			}
		}
	}
}

/**
 * Sim broker — routes between engine + ai + store + persistence/sqlite.
 * The visual shell (PRQ-4) wraps this with koota, but the broker
 * itself is headless and node-runnable so the alpha-stage 100-run gate
 * (Tier 1, no UI) can drive it directly.
 *
 * Per the import-boundary rule in CLAUDE.md, `src/sim/*` does NOT
 * import from `src/analytics/*`. Analytics refresh is wired by the
 * caller via the `onTerminal` PlayOptions hook (the 100-run test, the
 * PRQ-4 koota actions layer, etc.). Keeps the dependency direction
 * one-way: analytics may read sim outputs, sim never reaches sideways
 * into analytics.
 *
 * Public API:
 *   - createMatch(db, options) → MatchHandle: writes the matches row,
 *     returns the in-memory state.
 *   - playTurn(handle): advances one ply by asking the on-turn AI for
 *     a Decision, applying it through the engine reducer, persisting
 *     the move atomically with the matches.ply_count bump.
 *   - playToCompletion(handle, options?): runs playTurn in a loop
 *     until winner is set or the per-match ply cap is hit. Calls
 *     `options.onTerminal` exactly once at terminal transition.
 *   - saveMatchProgress / resumeMatch: AI-state dump-blob routing
 *     per docs/AI.md + docs/DB.md.
 */

import { randomUUID } from "node:crypto";
import {
	type AiState,
	CURRENT_DUMP_FORMAT_VERSION,
	chooseAction,
	createAiState,
	type Decision,
	dumpAiState,
	getProfile,
	type ProfileKey,
} from "@/ai";
import {
	type Action,
	type Color,
	createInitialState,
	applyAction as engineApply,
	type GameState,
	hashGameStateHex,
} from "@/engine";
import { aiStatesRepo, matchesRepo, movesRepo, type StoreDb } from "@/store";
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
}

export interface PlayTurnResult {
	readonly action: Action | null;
	readonly decision: Decision;
	readonly mover: Color;
	/** True iff the match transitioned to a terminal state on this turn. */
	readonly terminal: boolean;
	/**
	 * True iff this turn persisted a move row (i.e. plyCount bumped).
	 * False for forfeits and stalls — those are handled separately by
	 * `playToCompletion` to keep `result.plies` aligned with the
	 * persisted move log.
	 */
	readonly persistedMove: boolean;
}

export interface PlayOptions {
	/** Stop the match if it exceeds this many plies (used by alpha governor). */
	readonly maxPlies?: number;
	/**
	 * Stop the match if more than this many consecutive stall flips
	 * happen without a persisted move. Defaults to `maxPlies`. Stalls
	 * are not plies (no move row, no plyCount bump); they're loop
	 * iterations that flip the turn. Without a cap they could spin
	 * forever inside a chain dead-end.
	 */
	readonly maxStalls?: number;
	/** Pass `replay` for governor runs; defaults to `live`. */
	readonly mode?: "live" | "replay";
	/**
	 * Optional terminal-transition hook. `playTurn` invokes this
	 * exactly once — when the match transitions to a finished state
	 * (forfeit or engine-declared winner) — passing the matchId. The
	 * hook is the wiring point for `refreshOnMatchEnd` in
	 * `src/analytics`, which the broker is forbidden from calling
	 * directly per the import-boundary rule in CLAUDE.md. Both the
	 * 100-run alpha test and the PRQ-4 koota actions layer use this
	 * to plug analytics back in.
	 *
	 * Outlier ply/stall-cap exits in `playToCompletion` do NOT fire
	 * the hook: those matches have no `finishedAt` stamp, and
	 * `refreshOnMatchEnd` early-bails on un-finished matches.
	 */
	readonly onTerminal?: (matchId: string) => Promise<void> | void;
}

/**
 * Persist a fresh match row + return the in-memory handle. The
 * coin-flip seed is generated here (the only entropy in chonkers)
 * and recorded on the matches row for replay determinism.
 */
export async function createMatch(
	db: StoreDb,
	options: CreateMatchOptions,
): Promise<MatchHandle> {
	const matchId = options.matchId ?? randomUUID();
	const coinFlipSeed = options.coinFlipSeed ?? freshCoinFlipSeed();
	const firstPlayer = decideFirstPlayer(coinFlipSeed);
	const game = createInitialState(firstPlayer);

	await matchesRepo.createMatch(db, {
		id: matchId,
		redProfile: options.redProfile,
		whiteProfile: options.whiteProfile,
		openingPositionHash: hashGameStateHex(game),
		coinFlipSeed,
	});

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
	};
}

/**
 * Advance the match by one ply. Returns the resulting decision +
 * action + terminal flag. Updates the in-memory `handle.game` and
 * persists the move. On terminal transition (forfeit or engine-
 * declared winner), invokes `options.onTerminal` exactly once — this
 * is the analytics-refresh hook that the broker is forbidden from
 * calling directly (CLAUDE.md import boundary). PRQ-4's koota actions
 * layer drives `playTurn` directly, so the hook MUST fire here, not
 * only inside `playToCompletion`.
 */
export async function playTurn(
	db: StoreDb,
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
		await matchesRepo.forfeit(db, handle.matchId, mover);
		// Mirror the persisted winner field into the in-memory state
		// so callers can inspect handle.game.winner without another DB
		// hop. The forfeit-* values from the matches row don't fit the
		// engine's `Color | null` typing, so we encode the OPPOSITE
		// player as winner and rely on the matches row for the
		// forfeit-was-the-trigger detail.
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
		// No legal action and not below forfeit threshold. Per
		// RULES.md §5.4, a stalled chain just flips control. No move
		// row, no plyCount bump — but the chain MUST be cleared in the
		// DB or save/resume + analytics will see ghost chain
		// obligations on a row whose engine state has none.
		const hadChain = handle.game.chain !== null;
		handle.game = {
			...handle.game,
			turn: mover === "red" ? "white" : "red",
			chain: null,
		};
		if (hadChain) await matchesRepo.clearChain(db, handle.matchId);
		return {
			action: null,
			decision,
			mover,
			terminal: false,
			persistedMove: false,
		};
	}

	const action = decision.action;
	const prevChain = handle.game.chain;
	const next = engineApply(handle.game, action);

	await persistMoveAtomic(db, handle, mover, action, handle.game, next);

	handle.game = next;

	// Sync the chain column with the engine's authoritative state.
	// Every transition that changes `chain` must hit the DB so save/
	// resume and replay can reconstruct the obligation set.
	await syncChain(db, handle.matchId, prevChain, next.chain);

	if (next.winner) {
		await matchesRepo.finalizeMatch(db, handle.matchId, next.winner);
		if (options.onTerminal) await options.onTerminal(handle.matchId);
		return { action, decision, mover, terminal: true, persistedMove: true };
	}

	return { action, decision, mover, terminal: false, persistedMove: true };
}

/**
 * Persist the chain transition that just happened in the engine.
 * Diffing on the (source, owner, remainingDetachments) tuple keeps
 * the DB write rate down — most plies don't touch the chain at all.
 *
 * The chain.owner is folded into `chainRemainingJson` as
 * `{ owner, runs }` so we don't need a schema migration to add a
 * column. The legacy schema (just `runs`) was never persisted —
 * `syncChain` is the only writer — so this format is forward-only.
 */
async function syncChain(
	db: StoreDb,
	matchId: string,
	prev: GameState["chain"],
	next: GameState["chain"],
): Promise<void> {
	if (prev === next) return;
	if (next === null) {
		if (prev !== null) await matchesRepo.clearChain(db, matchId);
		return;
	}
	const nextJson = JSON.stringify({
		owner: next.owner,
		runs: next.remainingDetachments,
	});
	if (
		prev !== null &&
		prev.source.col === next.source.col &&
		prev.source.row === next.source.row &&
		prev.owner === next.owner &&
		JSON.stringify({
			owner: prev.owner,
			runs: prev.remainingDetachments,
		}) === nextJson
	) {
		return;
	}
	await matchesRepo.setChain(
		db,
		matchId,
		next.source.col,
		next.source.row,
		nextJson,
	);
}

/**
 * Loop until the match concludes or a cap is hit. The ply cap is the
 * alpha-governor's outlier threshold per docs/TESTING.md "Outlier
 * handling": exceeding the cap without a winner indicates an AI
 * evaluation gap, not a draw (chonkers has no draw rule). The stall
 * cap is a separate fuse against pathological non-persisting loops
 * (chain dead-ends that flip turns indefinitely without producing a
 * move row).
 *
 * `result.plies` mirrors the persisted move log — exactly the value
 * stored in `matches.ply_count`. `result.stalls` is a sim-only loop
 * counter for diagnostics and outlier classification.
 *
 * `options.onTerminal` is forwarded to each `playTurn` call and fires
 * exactly once — at the actual terminal transition (forfeit or
 * engine-declared winner). It does NOT fire on outlier exits (ply or
 * stall cap reached without a winner): outlier matches have no
 * `finishedAt` stamp and analytics' `refreshOnMatchEnd` correctly
 * skips them, so calling the hook would either be a no-op or
 * misattribute the event.
 */
export async function playToCompletion(
	db: StoreDb,
	handle: MatchHandle,
	options: PlayOptions = {},
): Promise<{
	readonly winner: Color | null;
	readonly plies: number;
	readonly stalls: number;
	readonly outlier: boolean;
}> {
	const plyCap = options.maxPlies ?? 1000;
	const stallCap = options.maxStalls ?? plyCap;
	// Seed `plies` from the persisted match state, NOT from 0. On a
	// resumed match where prior `playTurn` calls already happened,
	// starting at 0 would treat the cap as session-relative — letting
	// a partially played match run past the absolute `maxPlies` and
	// reporting a wrong total in `result.plies`.
	let plies = await currentPly(db, handle.matchId);
	let stalls = 0;
	while (!handle.game.winner && plies < plyCap && stalls < stallCap) {
		const result = await playTurn(db, handle, options);
		if (result.persistedMove) plies += 1;
		else if (!result.terminal) stalls += 1;
	}
	const outlier =
		!handle.game.winner && (plies >= plyCap || stalls >= stallCap);
	return {
		winner: handle.game.winner,
		plies,
		stalls,
		outlier,
	};
}

/**
 * Persist an executed move + bump the matches row's ply_count atomically.
 * Uses `movesRepo.appendMoveAndBumpPly` which wraps the read of
 * `matches.ply_count`, the move INSERT, and the ply_count UPDATE in a
 * single transaction so a crash mid-sequence cannot diverge the
 * persisted move log from `matches.ply_count`, and concurrent callers
 * cannot race into the same ply.
 */
async function persistMoveAtomic(
	db: StoreDb,
	handle: MatchHandle,
	mover: Color,
	action: Action,
	prevState: GameState,
	nextState: GameState,
): Promise<void> {
	// Combine all run indices into one slice_indices_json blob if
	// this was a multi-run action; otherwise leave null for moves.
	const allIndices = action.runs.flatMap((r) => r.indices);
	const isFullStack =
		allIndices.length === computePrevStackHeight(prevState, action);
	const sliceIndicesJson = isFullStack ? undefined : JSON.stringify(allIndices);
	const firstRun = action.runs[0];
	if (!firstRun) throw new Error("persistMoveAtomic: action has no runs");

	await movesRepo.appendMoveAndBumpPly(db, {
		matchId: handle.matchId,
		color: mover,
		fromCol: action.from.col,
		fromRow: action.from.row,
		toCol: firstRun.to.col,
		toRow: firstRun.to.row,
		stackHeightAfter: stackHeightAt(nextState, firstRun.to),
		positionHashAfter: hashGameStateHex(nextState),
		...(sliceIndicesJson !== undefined ? { sliceIndicesJson } : {}),
	});
}

async function currentPly(db: StoreDb, matchId: string): Promise<number> {
	const row = await matchesRepo.getMatch(db, matchId);
	if (!row) throw new Error(`currentPly: match ${matchId} missing`);
	return row.plyCount;
}

function computePrevStackHeight(state: GameState, action: Action): number {
	let h = 0;
	for (const piece of state.board.values()) {
		if (piece.col === action.from.col && piece.row === action.from.row) {
			h += 1;
		}
	}
	return h;
}

function stackHeightAt(
	state: GameState,
	cell: { col: number; row: number },
): number {
	let h = 0;
	for (const piece of state.board.values()) {
		if (piece.col === cell.col && piece.row === cell.row) h += 1;
	}
	return h;
}

/**
 * Persist the on-turn AI's dump_blob to ai_states. Used for mid-
 * match save points so resume can restore the AI's perf hints.
 */
export async function saveMatchProgress(
	db: StoreDb,
	handle: MatchHandle,
): Promise<void> {
	const turnPly = await currentPly(db, handle.matchId);
	const onTurnAi = handle.game.turn === "red" ? handle.ai.red : handle.ai.white;
	const profileKey =
		handle.game.turn === "red" ? handle.redProfile : handle.whiteProfile;
	const blob = dumpAiState(onTurnAi);
	await aiStatesRepo.upsertDump(db, {
		matchId: handle.matchId,
		profileKey,
		ply: turnPly,
		dumpBlob: blob,
		dumpFormatVersion: CURRENT_DUMP_FORMAT_VERSION,
	});
}

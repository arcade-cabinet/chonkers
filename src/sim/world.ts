/**
 * Koota world factory + action layer.
 *
 * `createSimWorld({db})` constructs a koota world with a single
 * "world entity" carrying the Screen / Match / Selection / chain
 * mirror traits. Actions mutate those traits and call into the
 * headless `./broker.ts` for engine work + persistence.
 *
 * Per CLAUDE.md import boundary: this module imports from `@/ai`,
 * `@/engine`, `@/store`, `@/persistence`, `@/audio` — same as the
 * broker — but NOT from `@/analytics` (analytics refresh is wired
 * via the broker's `onTerminal` hook).
 */

import { createActions, createWorld, type Entity, type World } from "koota";
import type { Action, Color } from "@/engine";
import { matchesRepo, type StoreDb } from "@/store";
import {
	applyHumanAction,
	type CreateMatchOptions,
	createMatch,
	type MatchHandle,
	playTurn,
	resumeMatch as resumeMatchInBroker,
} from "./broker";

const matchesRepoForfeit = matchesRepo.forfeit;

import { decideFirstPlayer } from "./coinFlip";
import {
	AiThinking,
	Ceremony,
	type CeremonySnapshot,
	HoldProgress,
	Match,
	piecesFromBoard,
	Screen,
	type ScreenKind,
	Selection,
	SplitChainView,
	SplitSelection,
	type SplitSelectionSnapshot,
} from "./traits";

/**
 * Returned from `createSimWorld`. Holds the koota world plus the
 * in-flight match handle (the broker's owned state). The visual
 * shell holds onto this through a React context.
 */
export interface CreateSimWorldOptions {
	readonly db: StoreDb;
	/**
	 * Called after every terminal match transition (forfeit or
	 * engine-declared winner). Wire `refreshOnMatchEnd` from
	 * `@/analytics` here in production. Per CLAUDE.md, `src/sim/*`
	 * cannot import `@/analytics` directly.
	 */
	readonly onMatchEnd?: (matchId: string) => Promise<void> | void;
}

export interface SimWorld {
	readonly world: World;
	readonly worldEntity: Entity;
	readonly db: StoreDb;
	readonly onMatchEnd: ((matchId: string) => Promise<void> | void) | undefined;
	/** The currently in-progress match handle, if any. */
	handle: MatchHandle | null;
	/**
	 * Monotonically-increasing token bumped by `newMatch` and
	 * `quitMatch`. Async actions (`stepTurn`, `commitHumanAction`,
	 * `forfeit`) capture the epoch at entry and bail out before
	 * mutating traits if the epoch has changed during the await —
	 * the user quit or started a new match while the AI was
	 * thinking, and the stale result must not overwrite the new
	 * world state.
	 */
	epoch: number;
}

export function createSimWorld(options: CreateSimWorldOptions): SimWorld {
	const world = createWorld({});
	// Spawn the singleton "app state" entity that carries the
	// always-present screen + UI traits. Match + SplitChainView are
	// added later via `set()`. Note: we use `world.spawn(...)`
	// rather than the createWorld(...traits) overload because the
	// latter routes traits onto an internal `IsExcluded` worldEntity
	// that doesn't appear in queries.
	const worldEntity = world.spawn(
		Screen({ value: "lobby" }),
		Selection({ cell: null }),
		HoldProgress({ value: 0 }),
		AiThinking({ value: false }),
		SplitSelection({ indices: [], armed: false }),
		Ceremony({
			phase: "idle",
			firstPlayer: "red",
			pieceProgress: 0,
			startedAtMs: 0,
		}),
	);
	return {
		world,
		worldEntity,
		db: options.db,
		onMatchEnd: options.onMatchEnd,
		handle: null,
		epoch: 0,
	};
}

/**
 * Add-or-set a trait on an entity. koota's `set()` requires the
 * trait to already be present on the entity; `add()` is the first-
 * time-add primitive. This helper picks the right one so callers
 * don't need to track which traits are currently present.
 */
/**
 * Shallow array equality. Used by `syncMatchTraits` to detect chain-
 * head transitions without holding a separate ref — both `prevHead`
 * and `nextHead` are read off the engine's `state.chain.remainingDetachments`,
 * which produces fresh array references on every commit, so reference
 * equality would always be false. Element-wise comparison gives us
 * "did the head's INTENT change" semantics.
 */
function arrayShallowEqual(
	a: ReadonlyArray<number> | null,
	b: ReadonlyArray<number> | null,
): boolean {
	if (a === b) return true;
	if (a === null || b === null) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function upsert<T>(
	entity: Entity,
	traitDef: { (...args: unknown[]): unknown; id: number } & object,
	value: T,
): void {
	if (entity.has(traitDef as never)) {
		entity.set(traitDef as never, value as never);
	} else {
		// `add(traitDef(value))` — koota's trait factories accept the
		// value object/factory-output as their argument and return a
		// ConfigurableTrait suitable for add().
		const factoryFn = traitDef as unknown as (v: T) => unknown;
		entity.add(factoryFn(value) as never);
	}
}

/**
 * Mirror the broker's match state onto the koota traits so React
 * subscriptions wake up. Called after every action that advances the
 * match (newMatch, playerMove, aiTurn, forfeit).
 *
 * `humanColor` and `plyCount` are passed in EXPLICITLY by the
 * caller. Implicit preservation from the prior trait snapshot
 * silently loses these on session-resume paths where the entity
 * had no Match trait before this sync — the caller (newMatch /
 * resumeMatch) is the only authoritative source.
 *
 * The `pieces` field is a frozen primitive snapshot derived from
 * the engine's board map. The trait does NOT store the live
 * `GameState` reference — the engine/UI boundary stays sealed.
 */
interface SyncMatchTraitsContext {
	readonly humanColor: Color | null;
	readonly plyCount: number;
	/**
	 * Source / destination of the move that this sync reflects.
	 * The sim broker passes this through after every commit so the
	 * Match trait carries an animation hint to the visual layer.
	 * Null on initial state and on resume (no move just happened).
	 */
	readonly lastMove?: {
		readonly from: { readonly col: number; readonly row: number };
		readonly to: { readonly col: number; readonly row: number };
	} | null;
}

function syncMatchTraits(sim: SimWorld, ctx: SyncMatchTraitsContext): void {
	const { worldEntity, handle } = sim;
	if (!handle) {
		if (worldEntity.has(Match)) worldEntity.remove(Match);
		if (worldEntity.has(SplitChainView)) worldEntity.remove(SplitChainView);
		// Match cleared → no chain → ensure SplitSelection is empty
		// so a stale armed selection from the prior match can't leak.
		worldEntity.set(SplitSelection, { indices: [], armed: false });
		return;
	}
	upsert(worldEntity, Match as never, {
		matchId: handle.matchId,
		redProfile: handle.redProfile,
		whiteProfile: handle.whiteProfile,
		humanColor: ctx.humanColor,
		turn: handle.game.turn,
		winner: handle.game.winner,
		plyCount: ctx.plyCount,
		pieces: piecesFromBoard(handle.game.board),
		lastMove: ctx.lastMove ?? null,
	});

	// Chain mirror + auto-arm (PRQ-A1 §5.4 chain UX, audited
	// 2026-04-30). When state.chain transitions to a non-empty head
	// AND the chain owner is the human's color AND it's their turn,
	// auto-populate SplitSelection with the head's slice indices and
	// flip armed=true so the player just needs to drag-to-commit. No
	// re-tap, no re-hold per chain step. Critically: this lives in
	// the broker-side trait flush, NOT in a React useEffect — the
	// previous attempt at a `useEffect([chainView.remainingDetachments[0]])`
	// triggered an OOM render-loop because koota traits hand back
	// fresh array literals on every snapshot, so the dep array
	// re-fired every render.
	//
	// Detection: compare `prevHead` (read from the existing
	// SplitChainView trait BEFORE we overwrite it) against the new
	// head. Auto-arm only on transition (prev !== next), not on
	// every sync that happens to carry the same chain.
	const prevView = worldEntity.has(SplitChainView)
		? worldEntity.get(SplitChainView)
		: null;
	const prevHead =
		prevView?.remainingDetachments?.[0] ??
		(null as ReadonlyArray<number> | null);

	if (handle.game.chain) {
		const nextHead = handle.game.chain.remainingDetachments[0] ?? null;
		upsert(worldEntity, SplitChainView as never, {
			source: handle.game.chain.source,
			owner: handle.game.chain.owner,
			remainingDetachments: handle.game.chain.remainingDetachments,
		});
		// Auto-arm logic: only fire when the head detachment changed
		// (chain entered, OR a chain step landed and the queue
		// advanced). A no-op sync (turn flip with same chain head)
		// produces no auto-arm side effect.
		const headChanged = !arrayShallowEqual(prevHead, nextHead);
		const ownerIsHuman =
			handle.game.chain.owner !== null &&
			ctx.humanColor !== null &&
			handle.game.chain.owner === ctx.humanColor;
		const ownerOnTurn = handle.game.turn === handle.game.chain.owner;
		if (
			headChanged &&
			nextHead !== null &&
			nextHead.length > 0 &&
			ownerIsHuman &&
			ownerOnTurn
		) {
			worldEntity.set(SplitSelection, {
				indices: [...nextHead].sort((a, b) => a - b),
				armed: true,
			});
		}
	} else {
		if (worldEntity.has(SplitChainView)) worldEntity.remove(SplitChainView);
		// Chain cleared (terminal commit, forfeit, or no-chain match
		// move) — clear any stale SplitSelection so the radial
		// doesn't show armed slices that no longer correspond to a
		// pending detachment.
		const cur = worldEntity.get(SplitSelection);
		if (cur && (cur.indices.length > 0 || cur.armed)) {
			worldEntity.set(SplitSelection, { indices: [], armed: false });
		}
	}
}

export interface NewMatchInput
	extends Pick<CreateMatchOptions, "redProfile" | "whiteProfile"> {
	/** Which color the human plays, or null for AI-vs-AI. */
	readonly humanColor: Color | null;
	readonly coinFlipSeed?: string;
}

/**
 * Action builder. Takes the SimWorld and returns the action record
 * koota's `useActions` consumes.
 *
 * Actions are async because they touch the database. The visual
 * shell awaits them when sequencing (e.g., newMatch → first AI turn
 * for a human-as-white opener).
 */
export function buildSimActions(sim: SimWorld) {
	return createActions(() => ({
		async newMatch(input: NewMatchInput): Promise<void> {
			sim.epoch += 1;
			const handle = await createMatch(sim.db, {
				redProfile: input.redProfile,
				whiteProfile: input.whiteProfile,
				...(input.coinFlipSeed !== undefined
					? { coinFlipSeed: input.coinFlipSeed }
					: {}),
			});
			sim.handle = handle;
			// Reset every transient UI trait so a non-title entry
			// (Play-again from EndScreen) starts the fresh match
			// without inheriting the prior match's Selection / hold-
			// progress / AiThinking state.
			sim.worldEntity.set(Selection, { cell: null });
			sim.worldEntity.set(HoldProgress, { value: 0 });
			sim.worldEntity.set(AiThinking, { value: false });
			sim.worldEntity.set(SplitSelection, { indices: [], armed: false });
			sim.worldEntity.set(Ceremony, {
				phase: "idle",
				firstPlayer: "red",
				pieceProgress: 0,
				startedAtMs: 0,
			});
			syncMatchTraits(sim, { humanColor: input.humanColor, plyCount: 0 });
			sim.worldEntity.set(Screen, { value: "play" });
		},

		/**
		 * Reload a previously-persisted unfinished match into the
		 * sim. Replays moves through the engine to reconstruct the
		 * GameState, restores the on-turn AI's perf state from
		 * ai_states (when available), bumps the epoch like newMatch
		 * so any in-flight stepTurn from a stale handle bails, and
		 * flips the Screen to "play".
		 *
		 * The persisted matches row carries `humanColor` only as
		 * derived from the broker's contract (humanColor is not in
		 * the row schema), so the caller (LobbyView's Resume tap)
		 * passes humanColor explicitly. For the alpha lobby we
		 * default `humanColor: "red"` to mirror the new-match
		 * default; B1 (difficulty/color picker) will route the
		 * persisted choice through preferences.
		 */
		async resumeMatch(input: {
			matchId: string;
			humanColor: Color | null;
		}): Promise<void> {
			sim.epoch += 1;
			const handle = await resumeMatchInBroker(sim.db, input.matchId);
			sim.handle = handle;
			sim.worldEntity.set(Selection, { cell: null });
			sim.worldEntity.set(HoldProgress, { value: 0 });
			sim.worldEntity.set(AiThinking, { value: false });
			sim.worldEntity.set(SplitSelection, { indices: [], armed: false });
			sim.worldEntity.set(Ceremony, {
				phase: "idle",
				firstPlayer: "red",
				pieceProgress: 0,
				startedAtMs: 0,
			});
			// plyCount comes from the matches row directly — read
			// from the matchRow inside the broker would be cleaner,
			// but the broker returned only the MatchHandle. Re-query
			// the row here for the canonical plyCount.
			const matchRow = await matchesRepo.getMatch(sim.db, input.matchId);
			const plyCount = matchRow?.plyCount ?? 0;
			syncMatchTraits(sim, {
				humanColor: input.humanColor,
				plyCount,
			});
			sim.worldEntity.set(Screen, { value: "play" });
		},

		async quitMatch(): Promise<void> {
			sim.epoch += 1;
			sim.handle = null;
			sim.worldEntity.set(Selection, { cell: null });
			sim.worldEntity.set(HoldProgress, { value: 0 });
			sim.worldEntity.set(AiThinking, { value: false });
			sim.worldEntity.set(SplitSelection, { indices: [], armed: false });
			sim.worldEntity.set(Ceremony, {
				phase: "idle",
				firstPlayer: "red",
				pieceProgress: 0,
				startedAtMs: 0,
			});
			if (sim.worldEntity.has(Match)) sim.worldEntity.remove(Match);
			if (sim.worldEntity.has(SplitChainView))
				sim.worldEntity.remove(SplitChainView);
			sim.worldEntity.set(Screen, { value: "lobby" });
		},

		setScreen(screen: ScreenKind): void {
			sim.worldEntity.set(Screen, { value: screen });
		},

		setCeremony(snapshot: CeremonySnapshot): void {
			sim.worldEntity.set(Ceremony, snapshot);
		},

		/**
		 * Returns the id of the most recent unfinished match, or null.
		 * The lobby's Resume button uses this to know whether the
		 * fast-forward affordance should be enabled.
		 */
		async findResumableMatch(): Promise<string | null> {
			const all = await matchesRepo.listMatches(sim.db);
			// Sort unfinished matches by startedAt DESC so the user
			// always lands on the most recent unfinished match. Without
			// the explicit sort, listMatches's NULL-finishedAt rows have
			// no defined relative order in SQL — a crash-recovery
			// scenario with two unfinished matches could pick the older
			// one and lose the user's most recent context.
			const unfinished = all
				.filter((m) => m.finishedAt === null)
				.sort((a, b) => b.startedAt - a.startedAt);
			return unfinished[0]?.id ?? null;
		},

		setSelection(cell: { col: number; row: number } | null): void {
			// Selection change resets SplitArm so a stale arm count
			// from the prior selection doesn't leak — RULES.md §5
			// only lets the same source split, and the count must
			// be re-armed against the new selection's stack height.
			const prior = sim.worldEntity.get(Selection)?.cell ?? null;
			const cellsDiffer =
				(!prior && cell !== null) ||
				(prior !== null &&
					cell !== null &&
					(prior.col !== cell.col || prior.row !== cell.row)) ||
				(!cell && prior !== null);
			sim.worldEntity.set(Selection, { cell });
			if (cellsDiffer)
				sim.worldEntity.set(SplitSelection, { indices: [], armed: false });
		},

		/**
		 * Toggle the slice at `index` in the current SplitSelection.
		 * Tapping a wedge in the radial overlay routes here. Resets
		 * `armed` to false on every toggle — re-arming requires a
		 * fresh 3000ms hold (RULES.md §5.2).
		 */
		toggleSplitSlice(index: number): void {
			// Reject invalid inputs silently (keeps the UI tap path
			// idempotent even if a stray negative or fractional comes
			// through). The radial caller already guards against
			// out-of-range, so this is defense in depth.
			if (!Number.isInteger(index) || index < 0) return;
			const cur =
				sim.worldEntity.get(SplitSelection) ??
				({ indices: [], armed: false } as SplitSelectionSnapshot);
			const has = cur.indices.includes(index);
			const next = has
				? cur.indices.filter((i: number) => i !== index)
				: [...cur.indices, index];
			sim.worldEntity.set(SplitSelection, {
				indices: [...next].sort((a: number, b: number) => a - b),
				armed: false,
			});
		},

		/**
		 * Clear the SplitSelection (no slices, not armed). Called on
		 * cancellation gestures (tap-outside-overlay per RULES.md §6,
		 * or selecting a different stack).
		 */
		clearSplitSelection(): void {
			sim.worldEntity.set(SplitSelection, { indices: [], armed: false });
		},

		/**
		 * Flip the `armed` flag — the 3000ms hold-to-arm timer (RULES
		 * §5.2) has fired. Drag-to-commit (§5.3) is the next gesture.
		 */
		armSplitSelection(): void {
			const cur = sim.worldEntity.get(SplitSelection);
			if (!cur || cur.indices.length === 0) return;
			sim.worldEntity.set(SplitSelection, {
				indices: cur.indices,
				armed: true,
			});
		},

		setHoldProgress(value: number): void {
			sim.worldEntity.set(HoldProgress, { value });
		},

		/**
		 * Advance the match by one ply (the on-turn AI's turn OR a
		 * human-committed action). The visual shell calls this after
		 * a human commits a move via the input pipeline OR when it's
		 * the AI's turn.
		 */
		async stepTurn(): Promise<void> {
			const handle = sim.handle;
			if (!handle) return;
			// Re-entrancy guard. AiThinking flips true synchronously
			// below, but a caller can fire stepTurn twice in the same
			// React batch (e.g., StrictMode double-invocation, or two
			// useEffects landing in the same microtask). Without this
			// guard, both calls observe `AiThinking === false`,
			// proceed in parallel, and produce two persisted moves
			// for one logical ply.
			if (sim.worldEntity.get(AiThinking)?.value) return;
			// Epoch token captured at entry. If newMatch / quitMatch
			// fires during the AI's `await playTurn`, the epoch
			// mismatches and we bail before mutating traits — the
			// stale result from the previous match must not overwrite
			// the new world state.
			const epoch = sim.epoch;
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const priorPly = prior?.plyCount ?? 0;
			sim.worldEntity.set(AiThinking, { value: true });
			try {
				const result = await playTurn(sim.db, handle, {
					mode: "live",
					...(sim.onMatchEnd ? { onTerminal: sim.onMatchEnd } : {}),
				});
				if (sim.epoch !== epoch || sim.handle !== handle) return;
				const newPly = result.persistedMove ? priorPly + 1 : priorPly;
				// stepTurn's `result.action` carries the AI's chosen
				// move on persistedMove turns. The visual layer uses
				// from→to-of-the-first-run as the animation hint
				// (split moves still animate the source departure;
				// the SplitChainView trait drives subsequent
				// detachment animations).
				const stepLastMove =
					result.persistedMove && result.action
						? {
								from: result.action.from,
								to: result.action.runs[0]?.to ?? result.action.from,
							}
						: null;
				syncMatchTraits(sim, {
					humanColor,
					plyCount: newPly,
					lastMove: stepLastMove,
				});
				if (result.terminal && handle.game.winner) {
					// Translate engine winner → screen. Human matches
					// route to win/lose. AI-vs-AI routes to a neutral
					// `spectator-result` screen since neither side is
					// "the player" — labelling it 'win' or 'lose'
					// would mislead a viewer about whose perspective
					// the message is from.
					if (humanColor === null) {
						sim.worldEntity.set(Screen, { value: "spectator-result" });
					} else {
						sim.worldEntity.set(Screen, {
							value: handle.game.winner === humanColor ? "win" : "lose",
						});
					}
				}
			} finally {
				sim.worldEntity.set(AiThinking, { value: false });
				sim.worldEntity.set(Ceremony, {
					phase: "idle",
					firstPlayer: "red",
					pieceProgress: 0,
					startedAtMs: 0,
				});
			}
		},

		// Internal helper: sync traits after an external mutation
		// (e.g., a human action applied directly through the engine
		// outside of stepTurn). Exposed for the input pipeline's
		// commit path to call after an action lands. Caller passes
		// humanColor + plyCount explicitly — the trait does not
		// preserve them implicitly across removes/adds.
		syncTraits(ctx: { humanColor: Color | null; plyCount: number }): void {
			syncMatchTraits(sim, ctx);
		},

		/**
		 * Apply a human-supplied action via the broker. Use from the
		 * input pipeline's commit path (drag-and-release, click-to-
		 * move, split-overlay commit). The engine validates legality;
		 * an `IllegalActionError` rejects the promise.
		 *
		 * Mirrors `stepTurn`'s screen-transition logic for terminal
		 * outcomes — wins/losses route to the right screen for the
		 * player's perspective.
		 */
		async commitHumanAction(action: Action): Promise<void> {
			const handle = sim.handle;
			if (!handle) return;
			// Same epoch / handle-identity guard as stepTurn — protects
			// against quitMatch / newMatch firing during the await.
			const epoch = sim.epoch;
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const priorPly = prior?.plyCount ?? 0;
			const result = await applyHumanAction(sim.db, handle, action, {
				...(sim.onMatchEnd ? { onTerminal: sim.onMatchEnd } : {}),
			});
			if (sim.epoch !== epoch || sim.handle !== handle) return;
			const newPly = result.persistedMove ? priorPly + 1 : priorPly;
			const humanLastMove = result.persistedMove
				? { from: action.from, to: action.runs[0]?.to ?? action.from }
				: null;
			syncMatchTraits(sim, {
				humanColor,
				plyCount: newPly,
				lastMove: humanLastMove,
			});
			// Selection clears after every committed action — the
			// human starts the next turn fresh.
			sim.worldEntity.set(Selection, { cell: null });
			if (result.terminal && handle.game.winner) {
				if (humanColor === null) {
					sim.worldEntity.set(Screen, { value: "spectator-result" });
				} else {
					sim.worldEntity.set(Screen, {
						value: handle.game.winner === humanColor ? "win" : "lose",
					});
				}
			}
		},

		/**
		 * Mark the on-turn human as forfeiting. Stamps the
		 * `forfeit-<color>` outcome on the matches row + flips the
		 * screen. Per the no-resignation-UI directive, this is also
		 * how the AI's weighted-forfeit decision lands when stepTurn
		 * returns kind:'forfeit' — but THIS action is the human-
		 * triggered button.
		 */
		async forfeit(): Promise<void> {
			const handle = sim.handle;
			if (!handle) return;
			// Same epoch / handle-identity guard as stepTurn.
			const epoch = sim.epoch;
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const mover = handle.game.turn;
			await matchesRepoForfeit(sim.db, handle.matchId, mover);
			if (sim.epoch !== epoch || sim.handle !== handle) return;
			handle.game = {
				...handle.game,
				winner: mover === "red" ? "white" : "red",
			};
			if (sim.onMatchEnd) await sim.onMatchEnd(handle.matchId);
			if (sim.epoch !== epoch || sim.handle !== handle) return;
			syncMatchTraits(sim, {
				humanColor,
				plyCount: prior?.plyCount ?? 0,
			});
			if (humanColor === null) {
				sim.worldEntity.set(Screen, { value: "spectator-result" });
			} else {
				sim.worldEntity.set(Screen, {
					value: humanColor === mover ? "lose" : "win",
				});
			}
		},

		// First-player coin-flip exposed so the title screen can show
		// who'll go first BEFORE the match is committed (for "ready?
		// red goes first" UX). Pure derivation; no side effects.
		previewFirstPlayer(seed: string): Color {
			return decideFirstPlayer(seed);
		},
	}));
}

/** The koota actions builder — pass `useActions(simActionsBuilder)` in
 *  React or call `simActionsBuilder(world)` directly outside React
 *  to get the bound action record. */
export type SimActionsBuilder = ReturnType<typeof buildSimActions>;

/** The bound action record (the methods you actually call). */
export type SimActions = ReturnType<SimActionsBuilder>;

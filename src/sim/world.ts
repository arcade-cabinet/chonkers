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
} from "./broker";

const matchesRepoForfeit = matchesRepo.forfeit;

import { decideFirstPlayer } from "./coinFlip";
import {
	AiThinking,
	HoldProgress,
	Match,
	piecesFromBoard,
	Screen,
	type ScreenKind,
	Selection,
	SplitChainView,
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
		Screen({ value: "title" }),
		Selection({ cell: null }),
		HoldProgress({ value: 0 }),
		AiThinking({ value: false }),
	);
	return {
		world,
		worldEntity,
		db: options.db,
		onMatchEnd: options.onMatchEnd,
		handle: null,
	};
}

/**
 * Add-or-set a trait on an entity. koota's `set()` requires the
 * trait to already be present on the entity; `add()` is the first-
 * time-add primitive. This helper picks the right one so callers
 * don't need to track which traits are currently present.
 */
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
}

function syncMatchTraits(sim: SimWorld, ctx: SyncMatchTraitsContext): void {
	const { worldEntity, handle } = sim;
	if (!handle) {
		if (worldEntity.has(Match)) worldEntity.remove(Match);
		if (worldEntity.has(SplitChainView)) worldEntity.remove(SplitChainView);
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
	});
	if (handle.game.chain) {
		upsert(worldEntity, SplitChainView as never, {
			source: handle.game.chain.source,
			owner: handle.game.chain.owner,
			remainingDetachments: handle.game.chain.remainingDetachments,
		});
	} else if (worldEntity.has(SplitChainView)) {
		worldEntity.remove(SplitChainView);
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
			const handle = await createMatch(sim.db, {
				redProfile: input.redProfile,
				whiteProfile: input.whiteProfile,
				...(input.coinFlipSeed !== undefined
					? { coinFlipSeed: input.coinFlipSeed }
					: {}),
			});
			sim.handle = handle;
			syncMatchTraits(sim, { humanColor: input.humanColor, plyCount: 0 });
			sim.worldEntity.set(Screen, { value: "play" });
		},

		async quitMatch(): Promise<void> {
			sim.handle = null;
			sim.worldEntity.set(Selection, { cell: null });
			sim.worldEntity.set(HoldProgress, { value: 0 });
			sim.worldEntity.set(AiThinking, { value: false });
			if (sim.worldEntity.has(Match)) sim.worldEntity.remove(Match);
			if (sim.worldEntity.has(SplitChainView))
				sim.worldEntity.remove(SplitChainView);
			sim.worldEntity.set(Screen, { value: "title" });
		},

		setScreen(screen: ScreenKind): void {
			sim.worldEntity.set(Screen, { value: screen });
		},

		setSelection(cell: { col: number; row: number } | null): void {
			sim.worldEntity.set(Selection, { cell });
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
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const priorPly = prior?.plyCount ?? 0;
			sim.worldEntity.set(AiThinking, { value: true });
			try {
				const result = await playTurn(sim.db, handle, {
					mode: "live",
					...(sim.onMatchEnd ? { onTerminal: sim.onMatchEnd } : {}),
				});
				const newPly = result.persistedMove ? priorPly + 1 : priorPly;
				syncMatchTraits(sim, { humanColor, plyCount: newPly });
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
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const priorPly = prior?.plyCount ?? 0;
			const result = await applyHumanAction(sim.db, handle, action, {
				...(sim.onMatchEnd ? { onTerminal: sim.onMatchEnd } : {}),
			});
			const newPly = result.persistedMove ? priorPly + 1 : priorPly;
			syncMatchTraits(sim, { humanColor, plyCount: newPly });
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
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const mover = handle.game.turn;
			await matchesRepoForfeit(sim.db, handle.matchId, mover);
			handle.game = {
				...handle.game,
				winner: mover === "red" ? "white" : "red",
			};
			if (sim.onMatchEnd) await sim.onMatchEnd(handle.matchId);
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

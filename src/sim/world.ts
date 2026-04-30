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
import type { Color } from "@/engine";
import type { StoreDb } from "@/store";
import {
	type CreateMatchOptions,
	createMatch,
	type MatchHandle,
	playTurn,
} from "./broker";
import { decideFirstPlayer } from "./coinFlip";
import {
	AiThinking,
	HoldProgress,
	Match,
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
 * match (newMatch, playerMove, aiTurn, forfeit). Preserves the
 * `humanColor` from the prior Match snapshot — the caller (newMatch)
 * sets it explicitly; subsequent syncs must not clobber it.
 */
function syncMatchTraits(sim: SimWorld): void {
	const { worldEntity, handle } = sim;
	if (!handle) {
		if (worldEntity.has(Match)) worldEntity.remove(Match);
		if (worldEntity.has(SplitChainView)) worldEntity.remove(SplitChainView);
		return;
	}
	const prior = worldEntity.get(Match);
	upsert(worldEntity, Match as never, {
		matchId: handle.matchId,
		redProfile: handle.redProfile,
		whiteProfile: handle.whiteProfile,
		humanColor: prior?.humanColor ?? null,
		turn: handle.game.turn,
		winner: handle.game.winner,
		plyCount: prior?.plyCount ?? 0,
		game: handle.game,
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
			upsert(sim.worldEntity, Match as never, {
				matchId: handle.matchId,
				redProfile: handle.redProfile,
				whiteProfile: handle.whiteProfile,
				humanColor: input.humanColor,
				turn: handle.game.turn,
				winner: null,
				plyCount: 0,
				game: handle.game,
			});
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
			sim.worldEntity.set(AiThinking, { value: true });
			try {
				const result = await playTurn(sim.db, handle, {
					mode: "live",
					...(sim.onMatchEnd ? { onTerminal: sim.onMatchEnd } : {}),
				});
				syncMatchTraits(sim);
				if (result.terminal && handle.game.winner) {
					// Translate engine winner → screen.
					const matchTrait = sim.worldEntity.get(Match);
					const humanColor = matchTrait?.humanColor ?? null;
					if (humanColor === null) {
						// AI-vs-AI — winner screen is informational.
						sim.worldEntity.set(Screen, {
							value: handle.game.winner === "red" ? "win" : "lose",
						});
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
		// commit path to call after an action lands.
		syncTraits(): void {
			syncMatchTraits(sim);
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

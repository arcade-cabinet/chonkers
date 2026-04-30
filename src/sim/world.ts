/**
 * Koota world factory + action layer.
 *
 * `createSimWorld()` constructs a koota world with a single
 * "world entity" carrying the Screen / Match / Selection / chain
 * mirror traits. Actions mutate those traits and call into the
 * headless `./broker.ts` for engine work.
 *
 * Persistence is the caller's concern — pass an `onPlyCommit` hook
 * via `CreateSimWorldOptions` if you want each ply to write the
 * match snapshot to KV. The 100-run alpha test runs without it.
 *
 * Per CLAUDE.md import boundary: this module imports from `@/ai`,
 * `@/engine`, and `./broker`. No `@/persistence`, no `@/scene`.
 */

import { createActions, createWorld, type Entity, type World } from "koota";
import type { Action, Color } from "@/engine";
import {
	applyHumanAction,
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
	piecesFromBoard,
	Screen,
	type ScreenKind,
	Selection,
	SplitChainView,
} from "./traits";

export interface CreateSimWorldOptions {
	/**
	 * Called after every successful ply (action committed, handle
	 * advanced). Wire `saveActiveMatch(snapshot)` from
	 * @/persistence/preferences/match here for runtime persistence.
	 */
	readonly onPlyCommit?: (handle: MatchHandle) => Promise<void> | void;
	/**
	 * Called once when the match transitions to a terminal state.
	 * Wire it to `archiveCompletedMatch + clearActiveMatch` (move from
	 * the active KV slot to history) in production.
	 */
	readonly onMatchEnd?: (handle: MatchHandle) => Promise<void> | void;
}

export interface SimWorld {
	readonly world: World;
	readonly worldEntity: Entity;
	readonly onPlyCommit:
		| ((handle: MatchHandle) => Promise<void> | void)
		| undefined;
	readonly onMatchEnd:
		| ((handle: MatchHandle) => Promise<void> | void)
		| undefined;
	/** The currently in-progress match handle, if any. */
	handle: MatchHandle | null;
	/**
	 * Monotonically-increasing token bumped by `newMatch` and
	 * `quitMatch`. Async actions (`stepTurn`, `commitHumanAction`,
	 * `forfeit`) capture the epoch at entry and bail out before
	 * mutating traits if the epoch has changed during the await.
	 */
	epoch: number;
}

export function createSimWorld(options: CreateSimWorldOptions = {}): SimWorld {
	const world = createWorld({});
	const worldEntity = world.spawn(
		Screen({ value: "title" }),
		Selection({ cell: null }),
		HoldProgress({ value: 0 }),
		AiThinking({ value: false }),
	);
	return {
		world,
		worldEntity,
		onPlyCommit: options.onPlyCommit,
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
function upsert<T>(
	entity: Entity,
	traitDef: { (...args: unknown[]): unknown; id: number } & object,
	value: T,
): void {
	if (entity.has(traitDef as never)) {
		entity.set(traitDef as never, value as never);
	} else {
		const factoryFn = traitDef as unknown as (v: T) => unknown;
		entity.add(factoryFn(value) as never);
	}
}

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
	readonly humanColor: Color | null;
	readonly coinFlipSeed?: string;
}

export function buildSimActions(sim: SimWorld) {
	return createActions(() => ({
		newMatch(input: NewMatchInput): void {
			sim.epoch += 1;
			const handle = createMatch({
				redProfile: input.redProfile,
				whiteProfile: input.whiteProfile,
				...(input.coinFlipSeed !== undefined
					? { coinFlipSeed: input.coinFlipSeed }
					: {}),
			});
			sim.handle = handle;
			sim.worldEntity.set(Selection, { cell: null });
			sim.worldEntity.set(HoldProgress, { value: 0 });
			sim.worldEntity.set(AiThinking, { value: false });
			syncMatchTraits(sim, { humanColor: input.humanColor, plyCount: 0 });
			sim.worldEntity.set(Screen, { value: "play" });
			// First persist for the active-match KV slot.
			if (sim.onPlyCommit) void sim.onPlyCommit(handle);
		},

		quitMatch(): void {
			sim.epoch += 1;
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

		async stepTurn(): Promise<void> {
			const handle = sim.handle;
			if (!handle) return;
			if (sim.worldEntity.get(AiThinking)?.value) return;
			const epoch = sim.epoch;
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const priorPly = prior?.plyCount ?? 0;
			sim.worldEntity.set(AiThinking, { value: true });
			try {
				const result = await playTurn(handle, {
					mode: "live",
					...(sim.onPlyCommit ? { onPlyCommit: sim.onPlyCommit } : {}),
					...(sim.onMatchEnd
						? { onTerminal: () => sim.onMatchEnd?.(handle) }
						: {}),
				});
				if (sim.epoch !== epoch || sim.handle !== handle) return;
				const newPly = result.persistedMove ? priorPly + 1 : priorPly;
				syncMatchTraits(sim, { humanColor, plyCount: newPly });
				if (result.terminal && handle.game.winner) {
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

		syncTraits(ctx: { humanColor: Color | null; plyCount: number }): void {
			syncMatchTraits(sim, ctx);
		},

		async commitHumanAction(action: Action): Promise<void> {
			const handle = sim.handle;
			if (!handle) return;
			const epoch = sim.epoch;
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const priorPly = prior?.plyCount ?? 0;
			const result = await applyHumanAction(handle, action, {
				...(sim.onPlyCommit ? { onPlyCommit: sim.onPlyCommit } : {}),
				...(sim.onMatchEnd
					? { onTerminal: () => sim.onMatchEnd?.(handle) }
					: {}),
			});
			if (sim.epoch !== epoch || sim.handle !== handle) return;
			const newPly = result.persistedMove ? priorPly + 1 : priorPly;
			syncMatchTraits(sim, { humanColor, plyCount: newPly });
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

		async forfeit(): Promise<void> {
			const handle = sim.handle;
			if (!handle) return;
			const epoch = sim.epoch;
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const mover = handle.game.turn;
			handle.game = {
				...handle.game,
				winner: mover === "red" ? "white" : "red",
			};
			if (sim.onMatchEnd) await sim.onMatchEnd(handle);
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

		previewFirstPlayer(seed: string): Color {
			return decideFirstPlayer(seed);
		},
	}));
}

export type SimActionsBuilder = ReturnType<typeof buildSimActions>;
export type SimActions = ReturnType<SimActionsBuilder>;

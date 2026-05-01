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
import {
	type Action,
	applyAction as applyEngineAction,
	type Color,
} from "@/engine";
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
	type HumanColor,
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

/**
 * Pick the post-terminal Screen based on humanColor + winner:
 *   - "red"/"white" (vs AI): "win" if the human won, "lose" otherwise.
 *   - "both" (PaP): "spectator-result" — both players sat at the
 *     table; the end-game overlay shows "Red wins" / "White wins"
 *     generically without picking a sad face for either of them.
 *   - null (sim mode): "spectator-result" — no human to address.
 */
function terminalScreen(humanColor: HumanColor, winner: Color): ScreenKind {
	if (humanColor === "red" || humanColor === "white") {
		return winner === humanColor ? "win" : "lose";
	}
	return "spectator-result";
}

interface SyncMatchTraitsContext {
	readonly humanColor: HumanColor;
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
	readonly humanColor: HumanColor;
	readonly coinFlipSeed?: string;
}

/**
 * Input for `actions.resumeMatch`. The persistence layer loads the
 * snapshot + decodes the base64 yuka brain pair, then passes the
 * decoded structures here. We re-create a fresh broker handle with
 * the same coinFlipSeed + profiles, install the restored AI states,
 * then replay the action log to reach the persisted ply.
 */
export interface ResumeMatchInput {
	readonly redProfile: import("@/ai").ProfileKey;
	readonly whiteProfile: import("@/ai").ProfileKey;
	readonly humanColor: HumanColor;
	readonly coinFlipSeed: string;
	readonly actions: ReadonlyArray<Action>;
	readonly ai: {
		readonly red: import("@/ai").AiState;
		readonly white: import("@/ai").AiState;
	};
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

		/**
		 * Resume a previously saved match from a hydrated snapshot.
		 * Reconstructs the broker handle (same seed + profiles), installs
		 * the restored AI states, replays each persisted action through
		 * the engine reducer to reach the saved ply, then syncs traits +
		 * flips Screen to "play".
		 */
		resumeMatch(input: ResumeMatchInput): void {
			sim.epoch += 1;
			const handle = createMatch({
				redProfile: input.redProfile,
				whiteProfile: input.whiteProfile,
				coinFlipSeed: input.coinFlipSeed,
			});
			handle.ai.red = input.ai.red;
			handle.ai.white = input.ai.white;
			for (const action of input.actions) {
				handle.game = applyEngineAction(handle.game, action);
				handle.actions.push(action);
			}
			sim.handle = handle;
			sim.worldEntity.set(Selection, { cell: null });
			sim.worldEntity.set(HoldProgress, { value: 0 });
			sim.worldEntity.set(AiThinking, { value: false });
			syncMatchTraits(sim, {
				humanColor: input.humanColor,
				plyCount: input.actions.length,
			});
			sim.worldEntity.set(Screen, { value: "play" });
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
			// `isCurrent()` guards against stale-epoch writes — if
			// `newMatch()` / `quitMatch()` / `resumeMatch()` supersedes
			// the handle while a turn is in flight, the persistence
			// hooks + AiThinking flip would otherwise corrupt the
			// replacement match's state. Every async-callback site
			// downstream needs the same guard.
			const isCurrent = (): boolean =>
				sim.epoch === epoch && sim.handle === handle;
			sim.worldEntity.set(AiThinking, { value: true });
			try {
				const result = await playTurn(handle, {
					mode: "live",
					...(sim.onPlyCommit
						? {
								onPlyCommit: (h) =>
									isCurrent() ? sim.onPlyCommit?.(h) : undefined,
							}
						: {}),
					...(sim.onMatchEnd
						? {
								onTerminal: () =>
									isCurrent() ? sim.onMatchEnd?.(handle) : undefined,
							}
						: {}),
				});
				if (!isCurrent()) return;
				const newPly = result.persistedMove ? priorPly + 1 : priorPly;
				syncMatchTraits(sim, { humanColor, plyCount: newPly });
				if (result.terminal && handle.game.winner) {
					sim.worldEntity.set(Screen, {
						value: terminalScreen(humanColor, handle.game.winner),
					});
				}
			} finally {
				if (isCurrent()) {
					sim.worldEntity.set(AiThinking, { value: false });
				}
			}
		},

		syncTraits(ctx: { humanColor: HumanColor; plyCount: number }): void {
			syncMatchTraits(sim, ctx);
		},

		async commitHumanAction(action: Action): Promise<void> {
			const handle = sim.handle;
			if (!handle) return;
			const epoch = sim.epoch;
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const priorPly = prior?.plyCount ?? 0;
			const isCurrent = (): boolean =>
				sim.epoch === epoch && sim.handle === handle;
			const result = await applyHumanAction(handle, action, {
				...(sim.onPlyCommit
					? {
							onPlyCommit: (h) =>
								isCurrent() ? sim.onPlyCommit?.(h) : undefined,
						}
					: {}),
				...(sim.onMatchEnd
					? {
							onTerminal: () =>
								isCurrent() ? sim.onMatchEnd?.(handle) : undefined,
						}
					: {}),
			});
			if (!isCurrent()) return;
			const newPly = result.persistedMove ? priorPly + 1 : priorPly;
			syncMatchTraits(sim, { humanColor, plyCount: newPly });
			sim.worldEntity.set(Selection, { cell: null });
			if (result.terminal && handle.game.winner) {
				sim.worldEntity.set(Screen, {
					value: terminalScreen(humanColor, handle.game.winner),
				});
			}
		},

		async forfeit(): Promise<void> {
			const handle = sim.handle;
			if (!handle) return;
			const epoch = sim.epoch;
			const prior = sim.worldEntity.get(Match);
			const humanColor = prior?.humanColor ?? null;
			const mover = handle.game.turn;
			const newWinner: Color = mover === "red" ? "white" : "red";
			handle.game = {
				...handle.game,
				winner: newWinner,
			};
			const isCurrent = (): boolean =>
				sim.epoch === epoch && sim.handle === handle;
			if (sim.onMatchEnd && isCurrent()) await sim.onMatchEnd(handle);
			if (!isCurrent()) return;
			syncMatchTraits(sim, {
				humanColor,
				plyCount: prior?.plyCount ?? 0,
			});
			sim.worldEntity.set(Screen, {
				value: terminalScreen(humanColor, newWinner),
			});
		},

		previewFirstPlayer(seed: string): Color {
			return decideFirstPlayer(seed);
		},
	}));
}

export type SimActionsBuilder = ReturnType<typeof buildSimActions>;
export type SimActions = ReturnType<SimActionsBuilder>;

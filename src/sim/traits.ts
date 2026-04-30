/**
 * Koota traits — the reactive data surface that `app/*` subscribes to.
 *
 * Traits are stored on entities in the koota world. The visual shell
 * subscribes via `useTrait`/`useQuery` from `koota/react`; sim
 * actions mutate them. The broker (`./broker.ts`) is the headless
 * source of truth — koota traits are a live mirror so the UI can
 * react without polling.
 *
 * Schema typing: koota's `trait()` SoA schema only accepts primitive
 * defaults. Object-valued slots use the AoS factory form
 * (`() => makeDefault()`) so the trait infers the right shape.
 */

import { trait } from "koota";
import type { ProfileKey } from "@/ai";
import type { Cell, Color, GameState } from "@/engine";

/** Top-level screen the app is showing. */
export type ScreenKind =
	| "title"
	| "play"
	| "win"
	| "lose"
	| "paused"
	| "settings";

export const Screen = trait({ value: "title" as ScreenKind });

/**
 * Active match metadata. Cardinality 1 — present iff a match is in
 * progress. Stored as a single AoS struct so the engine GameState
 * snapshot lands as a typed reference rather than getting flattened
 * to primitive fields.
 */
export interface MatchSnapshot {
	matchId: string;
	redProfile: ProfileKey;
	whiteProfile: ProfileKey;
	humanColor: Color | null;
	turn: Color;
	winner: Color | null;
	plyCount: number;
	game: GameState | null;
}

export const Match = trait(
	(): MatchSnapshot => ({
		matchId: "",
		redProfile: "balanced-medium",
		whiteProfile: "balanced-medium",
		humanColor: null,
		turn: "red",
		winner: null,
		plyCount: 0,
		game: null,
	}),
);

/** Currently selected source cell (if any). */
export interface SelectionSnapshot {
	cell: Cell | null;
}
export const Selection = trait((): SelectionSnapshot => ({ cell: null }));

/**
 * Active forced-split chain mirror. When non-null, `SplitOverlay` is
 * shown. Mirrors `state.chain` from the engine.
 */
export interface SplitChainSnapshot {
	source: Cell | null;
	owner: Color | null;
	remainingDetachments: ReadonlyArray<ReadonlyArray<number>>;
}
export const SplitChainView = trait(
	(): SplitChainSnapshot => ({
		source: null,
		owner: null,
		remainingDetachments: [],
	}),
);

/**
 * In-flight split-arm hold timer (0..1). Drives the SplitRadial's
 * `holdProgress` prop and the `holdFlash` motion variant.
 */
export const HoldProgress = trait({ value: 0 });

/** Whether the AI is currently thinking (so the UI can disable input). */
export const AiThinking = trait({ value: false });

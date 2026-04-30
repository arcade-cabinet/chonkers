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
import {
	type Cell,
	type Color,
	createInitialState,
	type Piece,
} from "@/engine";

/**
 * Top-level screen the app is showing.
 *
 * `spectator-result` is the AI-vs-AI termination screen. It exists
 * separately from `win` / `lose` (which presume a human player) so
 * an AI-vs-AI demo doesn't display "You win" / "You lose" labels
 * from the perspective of nobody.
 */
export type ScreenKind =
	| "lobby"
	| "play"
	| "win"
	| "lose"
	| "spectator-result"
	| "paused";

export const Screen = trait({ value: "lobby" as ScreenKind });

/**
 * A single piece's UI-relevant data. Stored in `MatchSnapshot.pieces`
 * as a flat array so React + R3F can iterate without reaching into
 * the engine's `Map<bigint, Piece>` keying scheme. Frozen on every
 * sync so accidental UI mutation surfaces as a TypeError rather
 * than silently corrupting engine state.
 */
export interface PiecePlacement {
	readonly col: number;
	readonly row: number;
	readonly height: number;
	readonly color: Color;
}

/**
 * Active match metadata. Cardinality 1 — present iff a match is in
 * progress.
 *
 * The `pieces` array is a frozen primitive snapshot derived from the
 * engine's `GameState.board`. The trait does NOT store a reference
 * to the live engine state — UI components consume only this
 * primitive surface, sealing the engine/UI boundary as the
 * visual-shell PRD mandates.
 */
export interface MatchSnapshot {
	readonly matchId: string;
	readonly redProfile: ProfileKey;
	readonly whiteProfile: ProfileKey;
	readonly humanColor: Color | null;
	readonly turn: Color;
	readonly winner: Color | null;
	readonly plyCount: number;
	readonly pieces: ReadonlyArray<PiecePlacement>;
	/**
	 * Source / destination of the most recently committed move,
	 * or null on initial state. The visual layer's piece-motion
	 * pipeline (PRQ-A3) reads this to animate moved pieces along
	 * an arc from `from` to `to` instead of teleporting them.
	 *
	 * Stored alongside the engine snapshot so animation is driven
	 * by the same trait flush as the position update — no separate
	 * channel to stay in sync with.
	 */
	readonly lastMove: {
		readonly from: { readonly col: number; readonly row: number };
		readonly to: { readonly col: number; readonly row: number };
	} | null;
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
		pieces: [],
		lastMove: null,
	}),
);

/**
 * Derive a frozen `PiecePlacement[]` from the engine's piece map.
 * Called from `world.ts` when syncing the Match trait — keeps the
 * derivation in one place so the trait's contract is "frozen
 * primitive snapshot" everywhere.
 */
export function piecesFromBoard(
	board: ReadonlyMap<bigint, Piece>,
): ReadonlyArray<PiecePlacement> {
	const out: PiecePlacement[] = [];
	for (const piece of board.values()) {
		out.push(
			Object.freeze({
				col: piece.col,
				row: piece.row,
				height: piece.height,
				color: piece.color,
			}),
		);
	}
	return Object.freeze(out);
}

/**
 * The canonical 5-4-3 starting layout, derived once at module load.
 * Visual-shell components (Pieces.tsx) reference this as the
 * fallback when no match is active so the board renders behind the
 * title scrim. Exported from `@/sim` so `app/*` components don't
 * have to import `@/engine` directly per the CLAUDE.md import-
 * boundary rule.
 */
export const FALLBACK_PIECES: ReadonlyArray<PiecePlacement> = piecesFromBoard(
	createInitialState().board,
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

/**
 * Slice selection for the radial split overlay (PRQ-A1).
 *
 * `indices` is an array of slice indices (top-down, 0-based) the
 * player has tapped on the radial of the currently-selected stack.
 * When `armed` flips true (after the 3000ms hold-to-arm timer per
 * RULES.md §5.2), the next pointer-drag commits the split:
 * the engine partitions `indices` into contiguous runs (top-down),
 * detaches the first run, and queues the remainder as a forced
 * chain (RULES.md §5.4).
 *
 * Empty `indices` + `armed=false` is the default — meaning the
 * selected stack will commit a full-stack move on the next
 * destination tap, no split.
 *
 * Replaces the old `SplitArm.count` trait + `SplitArmHeightBar`
 * widget with the unified RadialOverlay primitive.
 *
 * Reset on every newMatch / quitMatch / setSelection-to-different-
 * cell so a stale selection from one stack doesn't leak.
 */
export interface SplitSelectionSnapshot {
	readonly indices: ReadonlyArray<number>;
	readonly armed: boolean;
}
export const SplitSelection = trait(
	(): SplitSelectionSnapshot => ({ indices: [], armed: false }),
);

/**
 * New-match ceremony state. Drives the visible piece-placement
 * reveal + coin-flip sequence between lobby and play.
 *
 * Phases:
 *   - "idle"          — no ceremony in flight; lobby or mid-game.
 *   - "demo-clearing" — demo pieces lifting off board.
 *   - "placing-first" — first player's pieces flying to opening positions.
 *   - "placing-second" — opponent's pieces flying to opening positions.
 *   - "coin-flip"     — two-sided chip spinning to decide first move.
 *   - "settling"      — board tilting to playable angle as coin lands.
 *
 * `firstPlayer` is decided up-front (via decideFirstPlayer + the
 * coin-flip seed) so the ceremony can show pieces in turn order.
 * The actual broker createMatch already happened — this trait
 * just sequences the visual reveal.
 *
 * `pieceProgress` is the count of pieces that have landed in each
 * phase; the visual layer shows pieces 0..pieceProgress and
 * suppresses the rest until later phases.
 */
export type CeremonyPhase =
	| "idle"
	| "demo-clearing"
	| "placing-first"
	| "placing-second"
	| "coin-flip"
	| "settling";

export interface CeremonySnapshot {
	readonly phase: CeremonyPhase;
	readonly firstPlayer: Color;
	readonly pieceProgress: number;
	readonly startedAtMs: number;
}

export const Ceremony = trait(
	(): CeremonySnapshot => ({
		phase: "idle",
		firstPlayer: "red",
		pieceProgress: 0,
		startedAtMs: 0,
	}),
);

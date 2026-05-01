/**
 * Canonical engine types for Chonkers.
 *
 * Source of rules truth: docs/RULES.md. This module describes shape
 * only; legality lives in `./moves.ts`, win check in `./winCheck.ts`,
 * forced-split chain transitions in `./splitChain.ts`.
 *
 * The board is **3D occupancy**: each piece carries its own (col,
 * row, height) coordinates rather than living inside a per-cell
 * array. We store every piece in a single `Map<bigint, Piece>` keyed
 * by a 21-bit packed (col, row, height) integer. A "stack" is
 * materialised on demand via `materializeStack`.
 */

export type Color = "red" | "white";

/**
 * A single piece. Height is its 0-indexed position within whatever
 * stack it's part of (0 = bottom). When pieces move, their (col,
 * row, height) all change; we never mutate a Piece — we replace it
 * in the Map.
 */
export interface Piece {
	readonly col: number;
	readonly row: number;
	readonly height: number;
	readonly color: Color;
}

export interface Cell {
	readonly col: number;
	readonly row: number;
}

/**
 * Packed (col, row, height) → bigint. col, row, height each get 7
 * bits which is more than enough for chonkers' 9×11 board with
 * stacks ≤ 24. Layout: `(col << 14) | (row << 7) | height`.
 */
export type PositionKey = bigint;

/**
 * Board occupancy as a sparse map keyed by the packed position.
 * Empty cells are simply absent from the map.
 */
export type Board = ReadonlyMap<PositionKey, Piece>;

/**
 * A materialised stack: every piece in (col, row) sorted bottom-up.
 * `stack[0]` is the floor; `stack[stack.length - 1]` is the top, and
 * its colour is the cell's "owner". A 1-stack contains a single
 * piece.
 */
export type Stack = ReadonlyArray<Piece>;

/**
 * One contiguous run of slice indices to detach from a source stack
 * and place at `to`. Slice indices count from the TOP of the stack:
 * 0 is the topmost piece, 1 is the piece below, etc. (RULES.md §5.1).
 */
export interface Run {
	readonly indices: ReadonlyArray<number>;
	readonly to: Cell;
}

/**
 * Unified action. A move and a split are both `{from, runs:
 * [{indices, to}]}` — a full-stack move is a single run whose
 * `indices` covers every height in the stack. The reducer in
 * `./moves.ts` validates against rules; the engine never validates
 * implicitly.
 */
export interface Action {
	readonly from: Cell;
	readonly runs: ReadonlyArray<Run>;
}

/**
 * A pending forced-split chain — set ONLY when a multi-run split
 * stalled mid-resolution because a queued run had no legal
 * destination (RULES.md §5.4.1). The chain owner is locked into
 * retrying the head detachment on every subsequent turn until the
 * chain resolves or dies; their normal-move enumeration is empty
 * while the chain is pending. The opponent plays normally on their
 * intervening turns and is unaffected by the chain.
 *
 * `owner` is required because top-of-stack ownership at `source` can
 * shift between chain commits (an in-turn run can chonk through and
 * leave a mixed-colour residual). Without an explicit owner field,
 * the standard owner check would reject every chain retry whose
 * residual top now belongs to the opponent.
 */
export interface SplitChain {
	readonly source: Cell;
	readonly owner: Color;
	readonly remainingDetachments: ReadonlyArray<ReadonlyArray<number>>;
}

/**
 * Top-level game state. Immutable; reducers return a new GameState.
 */
export interface GameState {
	readonly board: Board;
	readonly turn: Color;
	readonly chain: SplitChain | null;
	readonly winner: Color | null;
}

/**
 * Match-level state — what gets persisted between turns. The match
 * id, profile pair, and entropy seed are decided once at match-
 * create time by the sim broker (`coin_flip_seed` is the only
 * entropy source in the entire game).
 */
export interface MatchState {
	readonly matchId: string;
	readonly redProfile: string;
	readonly whiteProfile: string;
	readonly coinFlipSeed: string;
	readonly openingPositionHash: string;
	readonly game: GameState;
}

/**
 * Pack (col, row, height) into a `PositionKey`. col, row, height
 * each use 7 bits; total 21 bits.
 *
 * Inputs are validated to fail fast: passing a non-integer or
 * out-of-7-bit-range value silently round-trips to a DIFFERENT legal
 * cell after `unpackPositionKey` masks to 7 bits, which would poison
 * board contents and Zobrist hashing without any visible error. The
 * `unpackPositionKey` symmetric guard catches keys that came from a
 * persistence round-trip with corrupted bits.
 */
const POSITION_FIELD_MAX = 127; // 7-bit range

export function positionKey(
	col: number,
	row: number,
	height: number,
): PositionKey {
	if (
		!Number.isInteger(col) ||
		!Number.isInteger(row) ||
		!Number.isInteger(height)
	) {
		throw new Error(
			`positionKey: col/row/height must be integers (got col=${col}, row=${row}, height=${height})`,
		);
	}
	if (
		col < 0 ||
		col > POSITION_FIELD_MAX ||
		row < 0 ||
		row > POSITION_FIELD_MAX ||
		height < 0 ||
		height > POSITION_FIELD_MAX
	) {
		throw new Error(
			`positionKey: col/row/height must be in [0, ${POSITION_FIELD_MAX}] (got col=${col}, row=${row}, height=${height})`,
		);
	}
	return (BigInt(col) << 14n) | (BigInt(row) << 7n) | BigInt(height);
}

/** Reverse `positionKey` for diagnostics + serialisation. */
export function unpackPositionKey(key: PositionKey): {
	col: number;
	row: number;
	height: number;
} {
	if (typeof key !== "bigint") {
		throw new TypeError(
			`unpackPositionKey: key must be bigint (got ${typeof key})`,
		);
	}
	if (key < 0n || key > 0x1fffffn) {
		// 0x1fffff === 2^21 - 1. Inlined rather than referencing the
		// module-scope constant to keep github-code-quality's static
		// analyzer from flagging an "implicit operand conversion" on
		// the comparison (it doesn't follow the type alias correctly).
		throw new Error(
			`unpackPositionKey: key out of 21-bit range: ${key.toString()}`,
		);
	}
	const height = Number(key & 0x7fn);
	const row = Number((key >> 7n) & 0x7fn);
	const col = Number((key >> 14n) & 0x7fn);
	return { col, row, height };
}

// `materializeStack`, `topPieceAt`, and `stackHeight` are in
// `./board.ts` — they operate on `Board` data, not types. Re-export
// the runtime helpers there to keep this file purely about types.

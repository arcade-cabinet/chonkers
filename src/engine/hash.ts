/**
 * Zobrist hash for chonkers `GameState`.
 *
 * The hash is a 64-bit XOR-fold over per-(piece, position) random
 * tags plus a turn tag plus a chain tag. The "random" tags here are
 * NOT runtime PRNG output — they're a fixed, hard-coded table seeded
 * deterministically at module load by a small splitmix64 driven from
 * a constant. The same chonkers binary always produces the same
 * Zobrist tags, on every host, every test run.
 *
 * This satisfies RULES.md determinism + AI.md replay-mode
 * requirements: identical states produce identical hashes across
 * machines, and the broker's outlier-replay flow can use the hash
 * as a position fingerprint.
 *
 * Why bigint:
 *   - JavaScript numbers lose precision above 2^53. We need a full
 *     64-bit hash to keep collision rate negligible across the
 *     ~10,000-run rc-stage cycle.
 *   - bigint XOR is well-defined.
 *
 * The hash is serialised as a hex string (16 chars) so it round-
 * trips cleanly through the SQL `position_hash_after` text column.
 */

import type { Board, Color, GameState, SplitChain } from "./types";
import { positionKey, unpackPositionKey } from "./types";

const SEED = 0x9e3779b97f4a7c15n; // golden-ratio constant
const MASK64 = (1n << 64n) - 1n;

function splitmix64(state: bigint): { value: bigint; next: bigint } {
	let z = (state + 0x9e3779b97f4a7c15n) & MASK64;
	z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
	z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
	z = (z ^ (z >> 31n)) & MASK64;
	return { value: z, next: (state + 0x9e3779b97f4a7c15n) & MASK64 };
}

/**
 * Per-(col, row, height, color) Zobrist tag table. Generated at
 * module load from a fixed seed so every host produces the same
 * table.
 */
const ZOBRIST_TABLE = (() => {
	const table = new Map<bigint, bigint>();
	let state = SEED;
	// 9 cols * 11 rows * 24 heights * 2 colours = 4752 tags
	for (let col = 0; col < 9; col += 1) {
		for (let row = 0; row < 11; row += 1) {
			for (let h = 0; h < 24; h += 1) {
				for (const color of ["red", "white"] as Color[]) {
					const r = splitmix64(state);
					state = r.next;
					const key =
						positionKey(col, row, h) ^ (color === "red" ? 0n : 1n << 22n);
					table.set(key, r.value);
				}
			}
		}
	}
	return table;
})();

// Salted seeds for the turn + chain marker tags. Computed as masked
// bigint constants up front so the splitmix64 inputs are unambiguous
// bigints (no implicit operand conversion in the call expressions
// — see code-quality bot warning).
const TURN_SEED: bigint = (SEED + 0xdeadbeefn) & MASK64;
const CHAIN_PRESENT_SEED: bigint = (SEED + 0xfeedfacen) & MASK64;

const TURN_TAG: bigint = splitmix64(TURN_SEED).value;
const CHAIN_PRESENT_TAG: bigint = splitmix64(CHAIN_PRESENT_SEED).value;

function pieceTag(
	col: number,
	row: number,
	height: number,
	color: Color,
): bigint {
	const key =
		positionKey(col, row, height) ^ (color === "red" ? 0n : 1n << 22n);
	const tag = ZOBRIST_TABLE.get(key);
	if (tag === undefined) {
		throw new Error(
			`zobrist: missing tag for (col=${col}, row=${row}, h=${height}, color=${color})`,
		);
	}
	return tag;
}

/** Fold every piece's Zobrist tag plus turn + chain markers. */
export function hashGameState(state: GameState): bigint {
	let h = 0n;
	for (const [key, piece] of state.board) {
		const { col, row, height } = unpackPositionKey(key);
		h ^= pieceTag(col, row, height, piece.color);
	}
	if (state.turn === "white") h ^= TURN_TAG;
	if (state.chain) h ^= chainTag(state.chain);
	return h & MASK64;
}

/**
 * Chain tag: hash of the chain's source cell + remaining
 * detachments. We don't try to be fancy here — fold each detachment
 * index pair into the running tag.
 */
function chainTag(chain: SplitChain): bigint {
	let h = CHAIN_PRESENT_TAG;
	h ^= BigInt(chain.source.col) << 8n;
	h ^= BigInt(chain.source.row);
	for (const run of chain.remainingDetachments) {
		for (const idx of run) {
			h = ((h << 1n) | (h >> 63n)) & MASK64;
			h ^= BigInt(idx);
		}
		h ^= 0xffn; // run separator
	}
	return h & MASK64;
}

/** Hex-encoded 16-char position fingerprint suitable for SQL storage. */
export function hashGameStateHex(state: GameState): string {
	return hashGameState(state).toString(16).padStart(16, "0");
}

/** Hash a bare board (no turn / no chain). Used by AI for transposition keys. */
export function hashBoard(board: Board): bigint {
	let h = 0n;
	for (const [key, piece] of board) {
		const { col, row, height } = unpackPositionKey(key);
		h ^= pieceTag(col, row, height, piece.color);
	}
	return h & MASK64;
}

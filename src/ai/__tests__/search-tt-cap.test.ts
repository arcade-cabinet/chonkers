/**
 * Regression test for the bounded transposition table.
 *
 * The 1000-run beta governor crashed with `RangeError: Map maximum
 * size exceeded` after ~58 minutes of hard-vs-hard play because the
 * TT had no cap and V8's Map ceiling (~16M entries) was hit mid-
 * search. The fix in `search.ts` clears the table when its size
 * reaches `TT_MAX_ENTRIES`. This test proves the contract by:
 *
 *   1. Pre-filling the TT to TT_MAX_ENTRIES.
 *   2. Running a single search through `chooseAction`.
 *   3. Asserting the post-search size is bounded — meaning the cap
 *      check + clear fired at least once.
 *
 * Pre-filling 1M entries takes ~150ms locally; well under the 5s
 * vitest default per-test timeout.
 */

import { describe, expect, it } from "vitest";
import { emptyBoard, type GameState, setPiece } from "@/engine";
import { chooseAction, createAiState, getProfile, TT_MAX_ENTRIES } from "..";

describe("search — bounded transposition table", () => {
	it("does not exceed TT_MAX_ENTRIES even when pre-filled to the cap", () => {
		// Small board so the search itself is cheap; the goal is to
		// exercise insertion path past the cap, not test playstrength.
		let board = emptyBoard();
		board = setPiece(board, { col: 4, row: 1, height: 0, color: "red" });
		board = setPiece(board, { col: 5, row: 1, height: 0, color: "red" });
		board = setPiece(board, { col: 4, row: 9, height: 0, color: "white" });
		board = setPiece(board, { col: 5, row: 9, height: 0, color: "white" });
		const state: GameState = {
			board,
			turn: "red",
			chain: null,
			winner: null,
		};
		const profile = getProfile("balanced-easy");
		const ai = createAiState("balanced-easy");

		// Pre-fill with synthetic entries. Use BigInt keys (the TT is
		// keyed by Zobrist hash, a bigint). Values are dummy entries
		// — the search code only reads `depth`, `flag`, `score` and
		// only when the key matches the live position, so collisions
		// with the synthetic seed are vanishingly unlikely and would
		// at worst skip a write.
		const tt = ai.transpositionTable as Map<bigint, unknown> as Map<
			bigint,
			{
				readonly hash: bigint;
				readonly depth: number;
				readonly score: number;
				readonly flag: "exact" | "lowerBound" | "upperBound";
				readonly bestMoveIndex: number;
			}
		>;
		for (let i = 0; i < TT_MAX_ENTRIES; i += 1) {
			const key = BigInt(i) + 1n;
			tt.set(key, {
				hash: key,
				depth: 0,
				score: 0,
				flag: "exact",
				bestMoveIndex: 0,
			});
		}
		expect(tt.size).toBe(TT_MAX_ENTRIES);

		// One full search. The cap-check inside alphaBeta MUST fire
		// when the first new write would push size over TT_MAX_ENTRIES,
		// clearing the table. Without the fix this throws RangeError
		// on V8 once size approaches 2^24.
		const decision = chooseAction(state, profile, "red", ai, {
			mode: "replay",
		});

		expect(decision.kind).toBe("act");
		// Post-search: TT size MUST be ≤ TT_MAX_ENTRIES. Equality is
		// fine (clear happened, then writes refilled toward cap), but
		// we never want to see TT_MAX_ENTRIES + 1.
		expect(tt.size).toBeLessThanOrEqual(TT_MAX_ENTRIES);
	});
});

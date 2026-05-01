/**
 * Action validation + reducer.
 *
 * Per RULES.md §3 / §4 / §5. The reducer is the single mutation
 * point for `GameState`; render trees and stores subscribe to its
 * output but never mutate the state directly. This module is pure
 * TypeScript; no PRNG, no IO, no Date.now.
 *
 * Action shape: `{from, runs: [{indices, to}]}` — a full-stack move
 * is a single run whose `indices` covers every height. A
 * non-contiguous split is multiple runs whose order matches RULES
 * §5.4's chain unfolding (top-most run first).
 *
 * The reducer:
 *   1. Validates the action against the current `GameState`.
 *   2. Applies each run in order, lifting slices off the source and
 *      placing them at the run's destination. Validates EACH run's
 *      legality against the residual stack height + destination
 *      stack height (RULES §4.2).
 *   3. Sets `chain` if there are unplaced runs after this turn (the
 *      action committed only the first run; the rest become the
 *      forced chain).
 *   4. Runs the win check.
 *   5. Flips `turn` (unless `winner` is set).
 *
 * Invalid actions throw `IllegalActionError`. The UI is responsible
 * for never dispatching an invalid action.
 */

import {
	cellOwner,
	detachSlices,
	materializeStack,
	ownedCells,
	placeSubStack,
	stackHeight,
} from "./board";
import { adjacentCells, isOnBoard } from "./positions";
import {
	isFullStackSelection,
	partitionRuns,
	validateSplitSelection,
} from "./slices";
import type {
	Action,
	Cell,
	Color,
	GameState,
	Run,
	SplitChain,
	Stack,
} from "./types";
import { resolveWinner } from "./winCheck";

export class IllegalActionError extends Error {
	constructor(reason: string) {
		super(`IllegalAction: ${reason}`);
		this.name = "IllegalActionError";
	}
}

/**
 * Returns the colours of the slices about to be detached, BOTTOM-UP,
 * given a top-down `indices` set against a known stack. Used for
 * sub-stack placement so dominance is preserved.
 */
function slicesToColorsBottomUp(
	stack: Stack,
	topDownIndices: ReadonlyArray<number>,
): Color[] {
	const h = stack.length;
	const detachedHeights = new Set(topDownIndices.map((i) => h - 1 - i));
	const out: Color[] = [];
	for (let height = 0; height < h; height += 1) {
		if (detachedHeights.has(height)) {
			out.push((stack[height] as { color: Color }).color);
		}
	}
	return out;
}

/**
 * Validate that one run is legal against the current source stack
 * height + destination stack height. Per RULES.md §4.2:
 *
 *   subStackHeight ≤ destStackHeight  OR  destStackHeight === 0
 *
 * Plus all the structural checks: destination on-board, destination
 * adjacent, indices within range.
 */
function validateRun(run: Run, source: Cell, currentStackHeight: number): void {
	const subHeight = run.indices.length;
	if (subHeight === 0) {
		throw new IllegalActionError("run has empty indices");
	}
	if (subHeight > currentStackHeight) {
		throw new IllegalActionError(
			`run requires ${subHeight} pieces but source has ${currentStackHeight}`,
		);
	}
	for (const idx of run.indices) {
		if (!Number.isInteger(idx) || idx < 0 || idx >= currentStackHeight) {
			throw new IllegalActionError(
				`slice index ${idx} out of range [0, ${currentStackHeight})`,
			);
		}
	}
	const seen = new Set<number>();
	for (const idx of run.indices) {
		if (seen.has(idx)) {
			throw new IllegalActionError(`duplicate slice index ${idx}`);
		}
		seen.add(idx);
	}

	if (!isOnBoard(run.to)) {
		throw new IllegalActionError(
			`destination (${run.to.col}, ${run.to.row}) is off-board`,
		);
	}
	const adj = adjacentCells(source);
	if (!adj.some((c) => c.col === run.to.col && c.row === run.to.row)) {
		throw new IllegalActionError(
			`destination (${run.to.col}, ${run.to.row}) is not adjacent to source (${source.col}, ${source.row})`,
		);
	}
}

/**
 * Apply a single action to a GameState. Returns a new GameState with
 * the move resolved, the chain updated (set or advanced), the win
 * check run, and the turn flipped (if no winner).
 *
 * Multi-run splits resolve EVERY run during this single call (RULES
 * §5.4): each run commits in selection order against the residual
 * board, with queued tail indices rebased after each commit. The only
 * way a chain spans turns is §5.4.1's stall — a queued run with no
 * legal destination at its commit time freezes the remaining runs
 * (head + tail) into `state.chain` and flips control. The chain
 * owner's next turn is forced to retry the head; the opponent plays
 * normally in the meantime.
 *
 * Chain-retry actions arrive as a single run matching the chain
 * head's indices, with a freshly chosen destination. If that retry's
 * destination is also illegal at retry time, the chain dies (the
 * residual pieces stay put, control flips, the chain field clears).
 *
 * @throws {IllegalActionError} if the action violates rules.
 */
export function applyAction(state: GameState, action: Action): GameState {
	if (state.winner) {
		throw new IllegalActionError("game already concluded");
	}

	const initialStack = materializeStack(state.board, action.from);
	if (initialStack.length === 0) {
		throw new IllegalActionError(
			`source cell (${action.from.col}, ${action.from.row}) is empty`,
		);
	}

	// Owner check: the top piece must belong to the side on turn —
	// EXCEPT during the chain owner's stall-retry. After a stall, the
	// residual source's top may belong to whoever was below the
	// detached pieces (which can be the opponent if a prior in-turn
	// commit chonked through and left a mixed residual). The chain
	// owner is still obligated to retry the head, so we exempt the
	// owner check when the action sources from the chain's frozen
	// source cell on the chain owner's turn.
	const owner = cellOwner(state.board, action.from);
	const isChainRetry =
		state.chain !== null &&
		state.chain.owner === state.turn &&
		state.chain.source.col === action.from.col &&
		state.chain.source.row === action.from.row;
	if (!isChainRetry && owner !== state.turn) {
		throw new IllegalActionError(
			`top of (${action.from.col}, ${action.from.row}) is owned by ${owner}, not ${state.turn}`,
		);
	}

	if (action.runs.length === 0) {
		throw new IllegalActionError("action has no runs");
	}

	// Chain-retry path: a stalled chain forces the owner's next turn
	// to be exactly one run matching the chain head, with a freshly
	// chosen destination.
	if (state.chain && state.chain.owner === state.turn) {
		if (
			state.chain.source.col !== action.from.col ||
			state.chain.source.row !== action.from.row
		) {
			throw new IllegalActionError(
				"chain in progress; action must continue from the chain source",
			);
		}
		const onlyRun = action.runs[0];
		if (action.runs.length !== 1 || !onlyRun) {
			throw new IllegalActionError(
				"chain retry must commit exactly one run per turn",
			);
		}
		const head = state.chain.remainingDetachments[0];
		if (!head) {
			throw new IllegalActionError("chain has no remaining detachments");
		}
		const runIndices = [...onlyRun.indices].sort((a, b) => a - b);
		const expected = [...head].sort((a, b) => a - b);
		if (
			runIndices.length !== expected.length ||
			runIndices.some((v, i) => v !== expected[i])
		) {
			throw new IllegalActionError(
				`chain retry indices ${JSON.stringify(runIndices)} do not match expected head ${JSON.stringify(expected)}`,
			);
		}
		return applyChainRetry(state, action.from, onlyRun);
	}

	// Validate the entire selection BEFORE applying anything (atomic
	// action) — this is the non-chain entry path.
	const allSelected: number[] = [];
	for (const run of action.runs) allSelected.push(...run.indices);
	const isFullStack =
		action.runs.length === 1 &&
		isFullStackSelection(allSelected, initialStack.length);
	if (!isFullStack) {
		const err = validateSplitSelection(allSelected, initialStack.length);
		if (err) throw new IllegalActionError(err);
		// Verify the run partition matches the contiguous-runs invariant.
		const expectedPartition = partitionRuns(allSelected);
		if (expectedPartition.length !== action.runs.length) {
			throw new IllegalActionError(
				`action declares ${action.runs.length} runs but the selection partitions into ${expectedPartition.length}`,
			);
		}
		for (let i = 0; i < expectedPartition.length; i += 1) {
			const exp = [...(expectedPartition[i] as ReadonlyArray<number>)].sort(
				(a, b) => a - b,
			);
			const got = [...(action.runs[i] as Run).indices].sort((a, b) => a - b);
			if (exp.length !== got.length || exp.some((v, j) => v !== got[j])) {
				throw new IllegalActionError(
					`run #${i} indices ${JSON.stringify(got)} do not match contiguous partition ${JSON.stringify(exp)}`,
				);
			}
		}
	}

	// Pre-validate the FIRST run's destination against the original
	// board. This is the only run guaranteed to commit — if the FIRST
	// run is illegal, the whole action is illegal (no implicit stall).
	// Subsequent runs are best-effort: if any is blocked at its commit
	// time, the chain stalls and freezes the remainder into state.chain.
	const firstRun = action.runs[0] as Run;
	validateRun(firstRun, action.from, initialStack.length);
	{
		const destHeight = stackHeight(state.board, firstRun.to);
		if (destHeight > 0 && firstRun.indices.length > destHeight) {
			throw new IllegalActionError(
				`cannot chonk: sub-stack of height ${firstRun.indices.length} > destination height ${destHeight}`,
			);
		}
	}

	// Resolve the runs sequentially against an evolving board, rebasing
	// queued indices after each commit. Each iteration picks the
	// (already-validated) destination from the action; if at any point
	// a queued run's destination is illegal we freeze the residual into
	// state.chain and flip control per RULES §5.4.1.
	let board = state.board;
	let pendingRuns: { indices: number[]; to: Cell }[] = action.runs.map((r) => ({
		indices: [...r.indices],
		to: r.to,
	}));

	while (pendingRuns.length > 0) {
		const run = pendingRuns[0] as { indices: number[]; to: Cell };
		const sourceStack = materializeStack(board, action.from);
		const sourceHeight = sourceStack.length;

		// First run was already validated; later runs need full
		// re-validation against the residual.
		const isFirstCommit = pendingRuns.length === action.runs.length;
		if (!isFirstCommit) {
			try {
				validateRun(run, action.from, sourceHeight);
			} catch (e) {
				if (e instanceof IllegalActionError) {
					// Structural problem with a queued run (out-of-bounds index,
					// off-board destination, non-adjacent destination): the
					// action itself is malformed. Reject the whole action.
					throw e;
				}
				throw e;
			}
			const destHeight = stackHeight(board, run.to);
			if (destHeight > 0 && run.indices.length > destHeight) {
				// STALL: queued destination became illegal because the
				// destination stack changed under us (an earlier run in
				// THIS action chonked into it). Freeze remainder, flip turn.
				const newChain: SplitChain = {
					source: action.from,
					owner: state.turn,
					remainingDetachments: pendingRuns.map((r) => [...r.indices]),
				};
				return {
					board,
					turn: flip(state.turn),
					chain: newChain,
					winner: null,
				};
			}
		}

		const slicesColors = slicesToColorsBottomUp(sourceStack, run.indices);
		const detached = detachSlices(board, action.from, run.indices);
		board = placeSubStack(detached.board, run.to, slicesColors);

		// Rebase every remaining queued run's indices against the now-
		// compacted source.
		const removedTopDown = run.indices;
		pendingRuns = pendingRuns.slice(1).map((r) => ({
			indices: rebaseTopDownIndices(r.indices, removedTopDown),
			to: r.to,
		}));
	}

	// All runs committed cleanly; no chain remains.
	const winner = resolveWinner(board, state.turn);
	return {
		board,
		turn: winner ? state.turn : flip(state.turn),
		chain: null,
		winner,
	};
}

/**
 * Apply a chain-retry action: the chain owner attempts the head run
 * with a fresh destination. If legal, commits the run, rebases queued
 * tail detachments against the residual, and either keeps the chain
 * pending (if more queued) or clears it (if this was the last). If
 * illegal, the chain DIES — the residual stays put, the chain clears,
 * control flips.
 *
 * The action's run.to is the destination; we re-validate against the
 * current board (the opponent's intervening move may have moved the
 * goalposts).
 */
function applyChainRetry(state: GameState, from: Cell, run: Run): GameState {
	if (!state.chain) {
		throw new IllegalActionError("applyChainRetry called without active chain");
	}
	const sourceStack = materializeStack(state.board, from);
	const sourceHeight = sourceStack.length;

	// Structural validation of the run.
	validateRun(run, from, sourceHeight);

	const destHeight = stackHeight(state.board, run.to);
	if (destHeight > 0 && run.indices.length > destHeight) {
		// Retry destination still illegal → chain DIES per §5.4.1.
		// Pieces stay put, chain clears, control flips.
		return {
			board: state.board,
			turn: flip(state.turn),
			chain: null,
			winner: null,
		};
	}

	// Commit the head, rebase the tail, and determine whether more
	// runs remain.
	const slicesColors = slicesToColorsBottomUp(sourceStack, run.indices);
	const detached = detachSlices(state.board, from, run.indices);
	const board = placeSubStack(detached.board, run.to, slicesColors);

	const tail = state.chain.remainingDetachments.slice(1);
	const rebased = tail.map((r) => rebaseTopDownIndices(r, run.indices));

	// Try to drain the rest immediately if their destinations exist.
	// But chain-retry doesn't carry destinations for tail runs (only
	// the head retry has a destination); the queued runs are
	// destination-less detachments that the player would normally drag
	// to a fresh destination during their resolution. Per §5.4 the
	// runs commit one-after-the-other within a turn — but a chain that
	// already stalled has lost its original destinations. The retry
	// path therefore commits only the head, then re-freezes the tail
	// (if any) for further retries on the next turn.
	let nextChain: SplitChain | null = null;
	if (rebased.length > 0) {
		nextChain = {
			source: from,
			owner: state.chain.owner,
			remainingDetachments: rebased,
		};
	}

	const winner = resolveWinner(board, state.turn);
	return {
		board,
		turn: winner ? state.turn : flip(state.turn),
		chain: winner ? null : nextChain,
		winner,
	};
}

function flip(c: Color): Color {
	return c === "red" ? "white" : "red";
}

/**
 * Rebase a queued top-down detachment against the residual stack
 * after `removed` indices were detached + the stack compacted.
 *
 * Top-down semantics: 0 = topmost. After removing a set of top-down
 * indices `R`, the stack compacts so the surviving piece originally
 * at top-down `j` is at new top-down `j - |{r in R : r < j}|`.
 *
 * Pre-conditions: every index in `queued` survived the detach (was
 * NOT in `removed`). The reducer enforces this — runs in a single
 * action partition the original selection, so no overlap.
 */
function rebaseTopDownIndices(
	queued: ReadonlyArray<number>,
	removed: ReadonlyArray<number>,
): number[] {
	const removedSorted = [...removed].sort((a, b) => a - b);
	return queued.map((j) => {
		let shift = 0;
		for (const r of removedSorted) {
			if (r < j) shift += 1;
			else break;
		}
		return j - shift;
	});
}

/**
 * Enumerate every legal action from `state` for the side on turn.
 * Used by the AI's alpha-beta search to expand the move tree.
 *
 * Returns one Action per (source-cell, run-set) combination. This is
 * pre-chain logic: if a chain is active, the only legal source is
 * the chain's source and the only legal run is the head detachment.
 */
export function enumerateLegalActions(state: GameState): Action[] {
	if (state.winner) return [];

	// Chain continuations are only legal on the chain owner's turn.
	// On the opponent's turn the chain stays pending (RULES.md §5.4
	// step 2) and the opponent plays normally — so we fall through to
	// the standard owned-cells enumeration below.
	if (state.chain && state.chain.owner === state.turn) {
		const source = state.chain.source;
		const head = state.chain.remainingDetachments[0];
		if (!head) return [];
		const subHeight = head.length;
		const result: Action[] = [];
		for (const to of adjacentCells(source)) {
			const destHeight = stackHeight(state.board, to);
			if (destHeight === 0 || subHeight <= destHeight) {
				result.push({
					from: source,
					runs: [{ indices: [...head], to }],
				});
			}
		}
		// Returning `result.length === 0` is fine: the chain dies and
		// the player loses tempo per RULES.md §5.4 ("If at any point a
		// queued chain step has no legal destination, the chain ends
		// and control flips"). Caller (AI / sim) handles this.
		return result;
	}

	// Reuse `ownedCells` from board.ts — single pass over the board
	// instead of building a top-height map and then rescanning the
	// pieces to find the colour at each top.
	const owned = ownedCells(state.board, state.turn);

	const result: Action[] = [];
	for (const source of owned) {
		const stack = materializeStack(state.board, source);
		const h = stack.length;
		// Full-stack moves: one run with indices [0..h-1] (all heights).
		const allIndices = Array.from({ length: h }, (_, i) => i);
		for (const to of adjacentCells(source)) {
			const destHeight = stackHeight(state.board, to);
			if (destHeight === 0 || h <= destHeight) {
				result.push({
					from: source,
					runs: [{ indices: allIndices, to }],
				});
			}
		}
		// Splits enumerated for the AI: contiguous slice-runs only.
		// Per RULES §5.4, a multi-run (non-contiguous) split commits
		// every run in one turn and the player must choose a
		// destination per run. The AI's tree-search already grows
		// fast on full-stack + contiguous-split combinations; adding
		// destination-tuples for non-contiguous selections multiplies
		// the branching by `8^(K-1)` per K-run split, which makes the
		// alpha-beta horizon too shallow to be useful at any
		// difficulty. Non-contiguous splits remain a HUMAN tactical
		// option (enforced + validated by `applyAction`); the AI
		// simply doesn't choose them. This is a strict subset, not a
		// rule deviation.
		if (h >= 2) {
			for (const run of enumerateContiguousRuns(h)) {
				const subHeight = run.length;
				for (const to of adjacentCells(source)) {
					const destHeight = stackHeight(state.board, to);
					if (destHeight === 0 || subHeight <= destHeight) {
						result.push({
							from: source,
							runs: [{ indices: [...run], to }],
						});
					}
				}
			}
		}
	}
	return result;
}

/**
 * Enumerate every CONTIGUOUS slice-run of length 1..h-1 over a stack
 * of height h. A contiguous run is a sub-array `[start, start+1, ...,
 * start+len-1]` of slice indices. Excludes the full-stack run (length
 * h) — that's a full-stack move enumerated separately.
 *
 * Examples:
 *   h=2 → [[0], [1]]
 *   h=3 → [[0], [1], [2], [0,1], [1,2]]
 *   h=4 → [[0], [1], [2], [3], [0,1], [1,2], [2,3], [0,1,2], [1,2,3]]
 *
 * Total runs: h*(h-1)/2 + (h-1) = (h-1)(h+2)/2 ≈ O(h²) — bounded.
 */
function enumerateContiguousRuns(h: number): number[][] {
	const result: number[][] = [];
	for (let len = 1; len < h; len += 1) {
		for (let start = 0; start + len <= h; start += 1) {
			const run: number[] = [];
			for (let i = 0; i < len; i += 1) run.push(start + i);
			result.push(run);
		}
	}
	return result;
}

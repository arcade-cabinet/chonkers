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

import { cellOwner, detachSlices, placeSubStack } from "./board";
import { adjacentCells, isOnBoard } from "./positions";
import {
	isFullStackSelection,
	partitionRuns,
	validateSplitSelection,
} from "./slices";
import {
	type Action,
	type Cell,
	type Color,
	type GameState,
	materializeStack,
	type Run,
	type SplitChain,
	type Stack,
	stackHeight,
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
 * @throws {IllegalActionError} if the action violates rules.
 */
export function applyAction(state: GameState, action: Action): GameState {
	if (state.winner) {
		throw new IllegalActionError("game already concluded");
	}

	const stack = materializeStack(state.board, action.from);
	if (stack.length === 0) {
		throw new IllegalActionError(
			`source cell (${action.from.col}, ${action.from.row}) is empty`,
		);
	}

	const owner = cellOwner(state.board, action.from);
	if (owner !== state.turn) {
		throw new IllegalActionError(
			`top of (${action.from.col}, ${action.from.row}) is owned by ${owner}, not ${state.turn}`,
		);
	}

	if (action.runs.length === 0) {
		throw new IllegalActionError("action has no runs");
	}

	// If a chain is in progress, the action must continue it.
	if (state.chain) {
		if (
			state.chain.source.col !== action.from.col ||
			state.chain.source.row !== action.from.row
		) {
			throw new IllegalActionError(
				"chain in progress; action must continue from the chain source",
			);
		}
		// During a chain, only ONE run is committed per turn (the next
		// detachment in line). The rest of the action's runs would be
		// wrong here — chain action must have exactly one run matching
		// the head detachment.
		if (action.runs.length !== 1) {
			throw new IllegalActionError(
				"chain step must commit exactly one run per turn",
			);
		}
		const head = state.chain.remainingDetachments[0];
		if (!head) {
			throw new IllegalActionError("chain has no remaining detachments");
		}
		const runIndices = [...action.runs[0]!.indices].sort((a, b) => a - b);
		const expected = [...head].sort((a, b) => a - b);
		if (
			runIndices.length !== expected.length ||
			runIndices.some((v, i) => v !== expected[i])
		) {
			throw new IllegalActionError(
				`chain step indices ${JSON.stringify(runIndices)} do not match expected detachment ${JSON.stringify(expected)}`,
			);
		}
	}

	// Validate every selection BEFORE applying anything (atomic action).
	if (!state.chain) {
		const allSelected: number[] = [];
		for (const run of action.runs) allSelected.push(...run.indices);
		if (
			action.runs.length === 1 &&
			isFullStackSelection(allSelected, stack.length)
		) {
			// Full-stack move — fine.
		} else {
			const err = validateSplitSelection(allSelected, stack.length);
			if (err) throw new IllegalActionError(err);
			// Verify the run partition matches the contiguous-runs invariant.
			const expected = partitionRuns(allSelected);
			if (expected.length !== action.runs.length) {
				throw new IllegalActionError(
					`action declares ${action.runs.length} runs but the selection partitions into ${expected.length}`,
				);
			}
			for (let i = 0; i < expected.length; i += 1) {
				const exp = [...(expected[i] as ReadonlyArray<number>)].sort(
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
	}

	// Apply the FIRST run only. The remaining runs (if any) become the
	// forced split chain that the player must complete on subsequent
	// turns. RULES.md §5.4 is explicit about this.
	const firstRun = action.runs[0] as Run;
	validateRun(firstRun, action.from, stack.length);

	// Validate the chonking rule against the destination's CURRENT
	// height — the residual source after detachment doesn't matter
	// for legality of the move itself.
	const destHeight = stackHeight(state.board, firstRun.to);
	if (destHeight > 0 && firstRun.indices.length > destHeight) {
		throw new IllegalActionError(
			`cannot chonk: sub-stack of height ${firstRun.indices.length} > destination height ${destHeight}`,
		);
	}

	const slicesColors = slicesToColorsBottomUp(stack, firstRun.indices);
	const detached = detachSlices(state.board, action.from, firstRun.indices);
	const placed = placeSubStack(detached.board, firstRun.to, slicesColors);

	// Compute new chain: leftover runs become the chain's remaining
	// detachments. If the action had only one run, the chain (if any
	// was active) is consumed.
	let newChain: SplitChain | null = null;
	if (state.chain) {
		const remaining = state.chain.remainingDetachments.slice(1);
		if (remaining.length > 0) {
			newChain = { source: action.from, remainingDetachments: remaining };
		}
	} else if (action.runs.length > 1) {
		// Begin a chain with the un-applied runs.
		newChain = {
			source: action.from,
			remainingDetachments: action.runs.slice(1).map((r) => [...r.indices]),
		};
	}

	const winner = resolveWinner(placed, state.turn);

	return {
		board: placed,
		turn: winner ? state.turn : flip(state.turn),
		chain: winner ? null : newChain,
		winner,
	};
}

function flip(c: Color): Color {
	return c === "red" ? "white" : "red";
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

	if (state.chain) {
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

	const owned: Cell[] = [];
	const seen = new Map<string, number>();
	for (const piece of state.board.values()) {
		const k = `${piece.col}:${piece.row}`;
		const prev = seen.get(k);
		if (prev === undefined || piece.height > prev) {
			seen.set(k, piece.height);
		}
	}
	for (const [k, topH] of seen) {
		const [col, row] = k.split(":").map(Number);
		// Top piece's colour determines ownership.
		const top = [...state.board.values()].find(
			(p) => p.col === col && p.row === row && p.height === topH,
		);
		if (top?.color === state.turn) {
			owned.push({ col: col as number, row: row as number });
		}
	}

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
		// Splits: each non-empty proper subset whose contiguous-run
		// partition is committable from `source`. We enumerate
		// subsets up to size h-1.
		if (h >= 2) {
			const subsets = enumerateSplitSubsets(h);
			for (const subset of subsets) {
				const partition = partitionRuns(subset);
				const firstRun = partition[0] as ReadonlyArray<number>;
				const subHeight = firstRun.length;
				for (const to of adjacentCells(source)) {
					const destHeight = stackHeight(state.board, to);
					if (destHeight === 0 || subHeight <= destHeight) {
						result.push({
							from: source,
							runs: partition.map((r, i) =>
								i === 0
									? { indices: [...r], to }
									: // Subsequent runs commit on later turns; the
										// destination is not chosen here. We seed
										// each with `to` as a placeholder; the AI
										// only consumes the first run when scoring.
										{ indices: [...r], to },
							),
						});
					}
				}
			}
		}
	}
	return result;
}

/**
 * Enumerate every non-empty proper subset of {0, 1, ..., h-1}.
 * Returns subsets sorted ascending. Excludes the empty set and the
 * full set.
 */
function enumerateSplitSubsets(h: number): number[][] {
	const total = 1 << h;
	const result: number[][] = [];
	// Skip 0 (empty) and (1 << h) - 1 (full).
	for (let mask = 1; mask < total - 1; mask += 1) {
		const subset: number[] = [];
		for (let i = 0; i < h; i += 1) {
			if ((mask >> i) & 1) subset.push(i);
		}
		result.push(subset);
	}
	return result;
}

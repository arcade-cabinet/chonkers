/**
 * Slice utilities for split actions.
 *
 * Per RULES.md §5.1, slice indices count from the TOP of a stack:
 * 0 is the topmost piece, 1 is the piece below, etc. Players select
 * 1..N-1 slices to detach (selecting all N is a full-stack move,
 * not a split, per §5.2).
 *
 * `partitionRuns` is the load-bearing helper: it groups a sorted
 * unique selection of slice indices into MAXIMAL CONTIGUOUS RUNS.
 * Contiguous slices move together as one sub-stack; non-contiguous
 * runs become a forced split chain (RULES.md §5.4).
 *
 * Worked examples from RULES.md §5.4:
 *   {0, 1, 4}    → [[0, 1], [4]]      one 2-piece run + one 1-piece chain step
 *   {0, 2, 5}    → [[0], [2], [5]]    three 1-piece runs (all chain steps)
 *   {0, 1, 2}    → [[0, 1, 2]]        one 3-piece run, no chain
 */

/**
 * Group a slice selection into maximal contiguous runs.
 *
 * Input must be a non-empty array of unique non-negative integers.
 * Returns runs sorted ascending; each run's indices are sorted
 * ascending within the run.
 *
 * Throws `RangeError` if the input is empty, contains duplicates,
 * negative indices, or non-integers.
 */
export function partitionRuns(
	indices: ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<number>> {
	if (indices.length === 0) {
		throw new RangeError("partitionRuns: empty selection is not a split");
	}
	for (const i of indices) {
		if (!Number.isInteger(i) || i < 0) {
			throw new RangeError(
				`partitionRuns: indices must be non-negative integers (got ${i})`,
			);
		}
	}
	const sorted = [...indices].sort((a, b) => a - b);
	for (let i = 1; i < sorted.length; i += 1) {
		if (sorted[i] === sorted[i - 1]) {
			throw new RangeError(
				`partitionRuns: duplicate index ${sorted[i]} in selection`,
			);
		}
	}

	const runs: number[][] = [];
	let current: number[] = [sorted[0] as number];
	for (let i = 1; i < sorted.length; i += 1) {
		const here = sorted[i] as number;
		const prev = sorted[i - 1] as number;
		if (here === prev + 1) {
			current.push(here);
		} else {
			runs.push(current);
			current = [here];
		}
	}
	runs.push(current);
	return runs;
}

/** A selection is a "full-stack move" iff it covers every index 0..N-1. */
export function isFullStackSelection(
	indices: ReadonlyArray<number>,
	stackHeight: number,
): boolean {
	if (indices.length !== stackHeight) return false;
	const seen = new Set(indices);
	for (let i = 0; i < stackHeight; i += 1) {
		if (!seen.has(i)) return false;
	}
	return true;
}

/**
 * Reject selections that violate RULES.md §5.2:
 *   - empty (no slices selected)
 *   - all N (that's a full-stack move, not a split)
 *   - contains an index ≥ stackHeight (out of range)
 *   - contains a duplicate
 *   - contains a negative index
 *
 * Returns null on success, or a human-readable error string on
 * violation.
 */
export function validateSplitSelection(
	indices: ReadonlyArray<number>,
	stackHeight: number,
): string | null {
	if (stackHeight < 2) {
		return `cannot split a ${stackHeight}-stack (RULES §5 requires ≥ 2)`;
	}
	if (indices.length === 0) return "split selection is empty";
	// Per-element checks (range + duplicate detection) come BEFORE the
	// length sanity check so a malformed selection reports its actual
	// shape problem (e.g. "duplicate slice index 1") rather than a
	// misleading "must select 1..N-1" length complaint.
	const seen = new Set<number>();
	for (const i of indices) {
		if (!Number.isInteger(i) || i < 0) {
			return `slice index ${i} must be a non-negative integer`;
		}
		if (i >= stackHeight) {
			return `slice index ${i} exceeds stack height ${stackHeight}`;
		}
		if (seen.has(i)) {
			return `duplicate slice index ${i}`;
		}
		seen.add(i);
	}
	if (indices.length >= stackHeight) {
		return `split must select 1..${stackHeight - 1} slices (got ${indices.length})`;
	}
	return null;
}

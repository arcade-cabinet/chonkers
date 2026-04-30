import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	isFullStackSelection,
	partitionRuns,
	validateSplitSelection,
} from "../slices";

describe("partitionRuns", () => {
	describe("worked examples from RULES.md §5.4", () => {
		it("{0, 1, 4} → [[0, 1], [4]]", () => {
			expect(partitionRuns([0, 1, 4])).toEqual([[0, 1], [4]]);
		});

		it("{0, 2, 5} → [[0], [2], [5]]", () => {
			expect(partitionRuns([0, 2, 5])).toEqual([[0], [2], [5]]);
		});

		it("{0, 1, 2} → [[0, 1, 2]] (single contiguous run)", () => {
			expect(partitionRuns([0, 1, 2])).toEqual([[0, 1, 2]]);
		});
	});

	it("orders input before partitioning", () => {
		expect(partitionRuns([4, 0, 1])).toEqual([[0, 1], [4]]);
		expect(partitionRuns([5, 2, 0])).toEqual([[0], [2], [5]]);
	});

	it("rejects empty selection", () => {
		expect(() => partitionRuns([])).toThrow(/empty/);
	});

	it("rejects negative indices", () => {
		expect(() => partitionRuns([0, -1])).toThrow(/non-negative/);
	});

	it("rejects non-integer indices", () => {
		expect(() => partitionRuns([0, 1.5])).toThrow(/non-negative integers/);
	});

	it("rejects duplicate indices", () => {
		expect(() => partitionRuns([0, 1, 1])).toThrow(/duplicate/);
	});

	it("partitions single-element selections trivially", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 23 }), (idx) => {
				expect(partitionRuns([idx])).toEqual([[idx]]);
			}),
			{ numRuns: 50 },
		);
	});

	it("PROPERTY: round-trip — partition returns runs whose flattened union equals the (unique sorted) input", () => {
		fc.assert(
			fc.property(
				fc
					.array(fc.integer({ min: 0, max: 23 }), {
						minLength: 1,
						maxLength: 8,
					})
					.map((arr) => Array.from(new Set(arr))),
				(unique) => {
					const sorted = [...unique].sort((a, b) => a - b);
					const runs = partitionRuns(sorted);
					const flat = runs.flat();
					expect(flat).toEqual(sorted);
				},
			),
			{ numRuns: 100 },
		);
	});

	it("PROPERTY: every run is a maximal contiguous range", () => {
		fc.assert(
			fc.property(
				fc
					.array(fc.integer({ min: 0, max: 23 }), {
						minLength: 2,
						maxLength: 8,
					})
					.map((arr) => Array.from(new Set(arr)).sort((a, b) => a - b)),
				(unique) => {
					fc.pre(unique.length >= 1);
					const runs = partitionRuns(unique);
					for (const run of runs) {
						for (let i = 1; i < run.length; i += 1) {
							expect(run[i]).toBe((run[i - 1] as number) + 1);
						}
					}
					// Adjacent runs must have a gap >= 2 between them.
					for (let i = 1; i < runs.length; i += 1) {
						const prev = runs[i - 1] as ReadonlyArray<number>;
						const cur = runs[i] as ReadonlyArray<number>;
						const tail = prev[prev.length - 1] as number;
						const head = cur[0] as number;
						expect(head).toBeGreaterThan(tail + 1);
					}
				},
			),
			{ numRuns: 100 },
		);
	});
});

describe("isFullStackSelection", () => {
	it("returns true when indices cover [0..N-1]", () => {
		expect(isFullStackSelection([0, 1, 2], 3)).toBe(true);
		expect(isFullStackSelection([2, 0, 1], 3)).toBe(true);
	});

	it("returns false when wrong length", () => {
		expect(isFullStackSelection([0, 1], 3)).toBe(false);
		expect(isFullStackSelection([0, 1, 2, 3], 3)).toBe(false);
	});

	it("returns false when indices skip a value", () => {
		expect(isFullStackSelection([0, 2, 3], 4)).toBe(false);
	});
});

describe("validateSplitSelection", () => {
	it("accepts a 1-of-3 selection", () => {
		expect(validateSplitSelection([0], 3)).toBeNull();
	});

	it("accepts a 2-of-3 selection", () => {
		expect(validateSplitSelection([0, 1], 3)).toBeNull();
	});

	it("rejects empty", () => {
		expect(validateSplitSelection([], 3)).toMatch(/empty/);
	});

	it("rejects all-N (a full-stack move, not a split)", () => {
		expect(validateSplitSelection([0, 1, 2], 3)).toMatch(/select 1\.\.2/);
	});

	it("rejects out-of-range indices", () => {
		expect(validateSplitSelection([0, 5], 3)).toMatch(/exceeds stack height/);
	});

	it("rejects selections on a 1-stack", () => {
		expect(validateSplitSelection([0], 1)).toMatch(/cannot split a 1-stack/);
	});

	it("rejects duplicate indices", () => {
		expect(validateSplitSelection([0, 1, 1], 3)).toMatch(/duplicate/);
	});

	it("rejects negative indices", () => {
		expect(validateSplitSelection([-1, 0], 3)).toMatch(/non-negative/);
	});
});

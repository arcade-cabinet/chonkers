import { describe, expect, it } from "vitest";
import {
	cellsEqual,
	cellToWorld,
	chebyshevDistance,
	isOnBoard,
} from "../coords";

describe("cellToWorld", () => {
	it("centres the board on the origin", () => {
		const middle = cellToWorld({ col: 4, row: 5 });
		expect(middle.x).toBeCloseTo(0);
		expect(middle.z).toBeCloseTo(0);
	});

	it("places the bottom-left corner at negative-x, negative-z", () => {
		const bl = cellToWorld({ col: 0, row: 0 });
		expect(bl.x).toBeLessThan(0);
		expect(bl.z).toBeLessThan(0);
	});
});

describe("isOnBoard", () => {
	it.each([
		[{ col: 0, row: 0 }, true],
		[{ col: 8, row: 10 }, true],
		[{ col: -1, row: 0 }, false],
		[{ col: 9, row: 5 }, false],
		[{ col: 4, row: 11 }, false],
	])("isOnBoard(%j) === %s", (cell, expected) => {
		expect(isOnBoard(cell)).toBe(expected);
	});
});

describe("cellsEqual", () => {
	it("compares structurally", () => {
		expect(cellsEqual({ col: 1, row: 2 }, { col: 1, row: 2 })).toBe(true);
		expect(cellsEqual({ col: 1, row: 2 }, { col: 2, row: 1 })).toBe(false);
	});
});

describe("chebyshevDistance", () => {
	it("returns 1 for any one-step neighbour", () => {
		const origin = { col: 4, row: 4 };
		const neighbours = [
			{ col: 3, row: 3 },
			{ col: 4, row: 3 },
			{ col: 5, row: 3 },
			{ col: 3, row: 4 },
			{ col: 5, row: 4 },
			{ col: 3, row: 5 },
			{ col: 4, row: 5 },
			{ col: 5, row: 5 },
		];
		for (const n of neighbours) {
			expect(chebyshevDistance(origin, n)).toBe(1);
		}
	});

	it("returns 0 for the same cell", () => {
		expect(chebyshevDistance({ col: 2, row: 2 }, { col: 2, row: 2 })).toBe(0);
	});

	it("returns the larger axis delta for non-neighbours", () => {
		expect(chebyshevDistance({ col: 0, row: 0 }, { col: 3, row: 1 })).toBe(3);
	});
});

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	adjacentCells,
	BOARD_COLS,
	BOARD_ROWS,
	cellsEqual,
	chebyshevDistance,
	isOnBoard,
	opponentHomeRow,
	posToVector3,
	RED_HOME_ROW,
	vector3ToPos,
	WHITE_HOME_ROW,
} from "../positions";

const cellArb = fc.record({
	col: fc.integer({ min: 0, max: BOARD_COLS - 1 }),
	row: fc.integer({ min: 0, max: BOARD_ROWS - 1 }),
});

describe("positions", () => {
	describe("isOnBoard", () => {
		it("accepts every (col, row) in [0, 8] × [0, 10]", () => {
			fc.assert(
				fc.property(cellArb, (cell) => {
					expect(isOnBoard(cell)).toBe(true);
				}),
				{ numRuns: 100 },
			);
		});

		it("rejects negative coordinates", () => {
			expect(isOnBoard({ col: -1, row: 0 })).toBe(false);
			expect(isOnBoard({ col: 0, row: -1 })).toBe(false);
		});

		it("rejects coordinates beyond the grid", () => {
			expect(isOnBoard({ col: BOARD_COLS, row: 0 })).toBe(false);
			expect(isOnBoard({ col: 0, row: BOARD_ROWS })).toBe(false);
		});
	});

	describe("posToVector3 / vector3ToPos", () => {
		it("round-trips every on-board cell", () => {
			fc.assert(
				fc.property(cellArb, (cell) => {
					const v = posToVector3(cell);
					const back = vector3ToPos(v);
					expect(back).toEqual(cell);
				}),
				{ numRuns: 100 },
			);
		});

		it("places (0, 0) at the negative-x, negative-z corner", () => {
			const v = posToVector3({ col: 0, row: 0 });
			expect(v.x).toBeLessThan(0);
			expect(v.z).toBeLessThan(0);
		});
	});

	describe("cellsEqual", () => {
		it("is reflexive", () => {
			fc.assert(
				fc.property(cellArb, (cell) => {
					expect(cellsEqual(cell, cell)).toBe(true);
				}),
				{ numRuns: 100 },
			);
		});

		it("is symmetric", () => {
			fc.assert(
				fc.property(cellArb, cellArb, (a, b) => {
					expect(cellsEqual(a, b)).toBe(cellsEqual(b, a));
				}),
				{ numRuns: 100 },
			);
		});
	});

	describe("chebyshevDistance", () => {
		it("returns 0 for same-cell pairs", () => {
			fc.assert(
				fc.property(cellArb, (cell) => {
					expect(chebyshevDistance(cell, cell)).toBe(0);
				}),
				{ numRuns: 100 },
			);
		});

		it("returns 1 for orthogonal one-step moves", () => {
			expect(chebyshevDistance({ col: 4, row: 4 }, { col: 4, row: 5 })).toBe(1);
			expect(chebyshevDistance({ col: 4, row: 4 }, { col: 5, row: 4 })).toBe(1);
		});

		it("returns 1 for diagonal one-step moves", () => {
			expect(chebyshevDistance({ col: 4, row: 4 }, { col: 5, row: 5 })).toBe(1);
			expect(chebyshevDistance({ col: 4, row: 4 }, { col: 3, row: 3 })).toBe(1);
		});
	});

	describe("adjacentCells", () => {
		it("returns 8 cells for an interior cell", () => {
			expect(adjacentCells({ col: 4, row: 5 })).toHaveLength(8);
		});

		it("returns 3 cells for a board corner", () => {
			expect(adjacentCells({ col: 0, row: 0 })).toHaveLength(3);
		});

		it("returns 5 cells for an edge cell", () => {
			expect(adjacentCells({ col: 4, row: 0 })).toHaveLength(5);
		});

		it("only returns on-board cells", () => {
			fc.assert(
				fc.property(cellArb, (cell) => {
					for (const adj of adjacentCells(cell)) {
						expect(isOnBoard(adj)).toBe(true);
					}
				}),
				{ numRuns: 100 },
			);
		});

		it("never returns the source cell itself", () => {
			fc.assert(
				fc.property(cellArb, (cell) => {
					for (const adj of adjacentCells(cell)) {
						expect(cellsEqual(adj, cell)).toBe(false);
					}
				}),
				{ numRuns: 100 },
			);
		});
	});

	describe("opponentHomeRow", () => {
		it("red's goal is white's home row (10)", () => {
			expect(opponentHomeRow("red")).toBe(WHITE_HOME_ROW);
			expect(WHITE_HOME_ROW).toBe(10);
		});

		it("white's goal is red's home row (0)", () => {
			expect(opponentHomeRow("white")).toBe(RED_HOME_ROW);
			expect(RED_HOME_ROW).toBe(0);
		});
	});
});

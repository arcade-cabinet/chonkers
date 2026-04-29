import { describe, expect, it } from "vitest";
import {
	cellOwner,
	detachSlices,
	emptyBoard,
	materializeStack,
	ownedCells,
	placeSubStack,
	setPiece,
	stackHeight,
	topPieceAt,
} from "..";

describe("emptyBoard", () => {
	it("starts with zero pieces", () => {
		expect(emptyBoard().size).toBe(0);
	});
});

describe("setPiece + materializeStack", () => {
	it("inserts and reads a single piece", () => {
		const b = setPiece(emptyBoard(), {
			col: 4,
			row: 5,
			height: 0,
			color: "red",
		});
		const stack = materializeStack(b, { col: 4, row: 5 });
		expect(stack).toHaveLength(1);
		expect(stack[0]?.color).toBe("red");
	});

	it("preserves bottom-up ordering when multiple heights present", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 1, row: 1, height: 0, color: "red" });
		b = setPiece(b, { col: 1, row: 1, height: 2, color: "white" });
		b = setPiece(b, { col: 1, row: 1, height: 1, color: "red" });
		const stack = materializeStack(b, { col: 1, row: 1 });
		expect(stack.map((p) => p.color)).toEqual(["red", "red", "white"]);
		expect(stack.map((p) => p.height)).toEqual([0, 1, 2]);
	});

	it("returns the new board without mutating the input", () => {
		const b0 = emptyBoard();
		const b1 = setPiece(b0, { col: 0, row: 0, height: 0, color: "red" });
		expect(b0.size).toBe(0);
		expect(b1.size).toBe(1);
	});
});

describe("topPieceAt + stackHeight + cellOwner", () => {
	it("returns null / 0 / null for an empty cell", () => {
		const b = emptyBoard();
		expect(topPieceAt(b, { col: 0, row: 0 })).toBeNull();
		expect(stackHeight(b, { col: 0, row: 0 })).toBe(0);
		expect(cellOwner(b, { col: 0, row: 0 })).toBeNull();
	});

	it("returns the highest-height piece as top", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 5, height: 1, color: "white" });
		expect(topPieceAt(b, { col: 4, row: 5 })?.color).toBe("white");
		expect(stackHeight(b, { col: 4, row: 5 })).toBe(2);
		expect(cellOwner(b, { col: 4, row: 5 })).toBe("white");
	});
});

describe("ownedCells", () => {
	it("returns only cells whose top is the player's colour", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 0, row: 0, height: 0, color: "red" });
		b = setPiece(b, { col: 1, row: 1, height: 0, color: "white" });
		b = setPiece(b, { col: 2, row: 2, height: 0, color: "red" });
		b = setPiece(b, { col: 2, row: 2, height: 1, color: "white" });

		const reds = ownedCells(b, "red");
		const whites = ownedCells(b, "white");
		expect(reds.map((c) => `${c.col}-${c.row}`).sort()).toEqual(["0-0"]);
		expect(whites.map((c) => `${c.col}-${c.row}`).sort()).toEqual([
			"1-1",
			"2-2",
		]);
	});
});

describe("detachSlices", () => {
	it("detaches a top slice and reports its colour", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 5, height: 1, color: "white" });
		const result = detachSlices(b, { col: 4, row: 5 }, [0]); // top
		expect(result.removed).toEqual(["white"]);
		expect(result.residualHeight).toBe(1);
		expect(stackHeight(result.board, { col: 4, row: 5 })).toBe(1);
		expect(topPieceAt(result.board, { col: 4, row: 5 })?.color).toBe("red");
	});

	it("compacts heights so the residual stack stays contiguous from 0", () => {
		// 3-stack: heights 0=red, 1=white, 2=red. Detach the middle (slice index 1 = top-down 1).
		let b = emptyBoard();
		b = setPiece(b, { col: 0, row: 0, height: 0, color: "red" });
		b = setPiece(b, { col: 0, row: 0, height: 1, color: "white" });
		b = setPiece(b, { col: 0, row: 0, height: 2, color: "red" });
		const { board, removed, residualHeight } = detachSlices(
			b,
			{ col: 0, row: 0 },
			[1], // top-down 1 = bottom-up height 1 (the white piece)
		);
		expect(removed).toEqual(["white"]);
		expect(residualHeight).toBe(2);
		const stack = materializeStack(board, { col: 0, row: 0 });
		expect(stack.map((p) => p.height)).toEqual([0, 1]);
		expect(stack.map((p) => p.color)).toEqual(["red", "red"]);
	});
});

describe("placeSubStack", () => {
	it("appends colours bottom-up at the destination's current height", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "red" }); // 1-stack red
		b = placeSubStack(b, { col: 4, row: 5 }, ["white", "red"]);
		const stack = materializeStack(b, { col: 4, row: 5 });
		expect(stack.map((p) => p.color)).toEqual(["red", "white", "red"]);
		expect(stack.map((p) => p.height)).toEqual([0, 1, 2]);
	});
});

import { describe, expect, it } from "vitest";
import { emptyBoard, playerSatisfiesWin, resolveWinner, setPiece } from "..";

describe("playerSatisfiesWin", () => {
	it("false for an empty board", () => {
		const b = emptyBoard();
		expect(playerSatisfiesWin(b, "red")).toBe(false);
		expect(playerSatisfiesWin(b, "white")).toBe(false);
	});

	it("false when player has no owned cells", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 0, row: 5, height: 0, color: "white" });
		expect(playerSatisfiesWin(b, "red")).toBe(false);
	});

	it("true for red iff every red top sits on row 10 (white's home row)", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 0, row: 10, height: 0, color: "red" });
		b = setPiece(b, { col: 1, row: 10, height: 0, color: "red" });
		expect(playerSatisfiesWin(b, "red")).toBe(true);
	});

	it("false for red when one red top is off-row", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 0, row: 10, height: 0, color: "red" });
		b = setPiece(b, { col: 1, row: 9, height: 0, color: "red" });
		expect(playerSatisfiesWin(b, "red")).toBe(false);
	});

	it("true for white iff every white top sits on row 0", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 0, row: 0, height: 0, color: "white" });
		expect(playerSatisfiesWin(b, "white")).toBe(true);
	});
});

describe("resolveWinner", () => {
	it("returns the moving player when both satisfy simultaneously (tie-break)", () => {
		// Construct a board where red AND white both have all their tops on the
		// opponent's home row. (Easy to construct: 1 red on row 10, 1 white on row 0.)
		let b = emptyBoard();
		b = setPiece(b, { col: 0, row: 10, height: 0, color: "red" });
		b = setPiece(b, { col: 0, row: 0, height: 0, color: "white" });
		expect(resolveWinner(b, "red")).toBe("red");
		expect(resolveWinner(b, "white")).toBe("white");
	});

	it("returns null on inconclusive board", () => {
		let b = emptyBoard();
		b = setPiece(b, { col: 0, row: 5, height: 0, color: "red" });
		expect(resolveWinner(b, "red")).toBeNull();
	});
});

import { describe, expect, it } from "vitest";
import {
	type Board,
	emptyBoard,
	type GameState,
	setPiece,
} from "@/engine";
import { computeFeatures } from "../features";

function gs(board: Board, turn: "red" | "white" = "red"): GameState {
	return { board, turn, chain: null, winner: null };
}

describe("computeFeatures — cluster + threat features", () => {
	it("mobile_threat_count counts own stacks of height ≥ 2", () => {
		let b = emptyBoard();
		// Red 1-stack (not a threat).
		b = setPiece(b, { col: 0, row: 0, height: 0, color: "red" });
		// Red 2-stack at (1, 1).
		b = setPiece(b, { col: 1, row: 1, height: 0, color: "red" });
		b = setPiece(b, { col: 1, row: 1, height: 1, color: "red" });
		// Red 3-stack at (2, 2).
		b = setPiece(b, { col: 2, row: 2, height: 0, color: "red" });
		b = setPiece(b, { col: 2, row: 2, height: 1, color: "red" });
		b = setPiece(b, { col: 2, row: 2, height: 2, color: "red" });
		// White 2-stack — must NOT contribute to red's count.
		b = setPiece(b, { col: 5, row: 5, height: 0, color: "white" });
		b = setPiece(b, { col: 5, row: 5, height: 1, color: "white" });
		const f = computeFeatures(gs(b, "red"), "red");
		expect(f.mobile_threat_count).toBe(2);
	});

	it("even_trade_count counts own-1-stack ↔ opp-1-stack adjacencies", () => {
		let b = emptyBoard();
		// Red 1-stack at (4, 4); white 1-stacks at (4, 5) and (5, 4) and (3, 3).
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "white" });
		b = setPiece(b, { col: 5, row: 4, height: 0, color: "white" });
		b = setPiece(b, { col: 3, row: 3, height: 0, color: "white" });
		// Non-adjacent white — must NOT count.
		b = setPiece(b, { col: 7, row: 7, height: 0, color: "white" });
		const f = computeFeatures(gs(b, "red"), "red");
		expect(f.even_trade_count).toBe(3);
	});

	it("cluster_density counts unordered own-own adjacency pairs", () => {
		let b = emptyBoard();
		// Three red 1-stacks in a horizontal line: (0,0), (1,0), (2,0).
		// Adjacency pairs: (0,0)-(1,0), (1,0)-(2,0). Two pairs total.
		b = setPiece(b, { col: 0, row: 0, height: 0, color: "red" });
		b = setPiece(b, { col: 1, row: 0, height: 0, color: "red" });
		b = setPiece(b, { col: 2, row: 0, height: 0, color: "red" });
		const f = computeFeatures(gs(b, "red"), "red");
		expect(f.cluster_density).toBe(2);
	});

	it("longest_wall finds the longest contiguous own row-run", () => {
		let b = emptyBoard();
		// Row 4: cols 1, 2, 3, 5, 6 — runs of 3 and 2. Longest = 3.
		for (const c of [1, 2, 3, 5, 6]) {
			b = setPiece(b, { col: c, row: 4, height: 0, color: "red" });
		}
		// Row 6: a single isolated red — run of 1.
		b = setPiece(b, { col: 0, row: 6, height: 0, color: "red" });
		const f = computeFeatures(gs(b, "red"), "red");
		expect(f.longest_wall).toBe(3);
	});

	it("funnel_pressure counts opp cells with ≥ 2 own neighbours", () => {
		let b = emptyBoard();
		// White at (4, 4). Red at (3, 3), (3, 4), (3, 5) — 3 neighbours of white.
		b = setPiece(b, { col: 4, row: 4, height: 0, color: "white" });
		b = setPiece(b, { col: 3, row: 3, height: 0, color: "red" });
		b = setPiece(b, { col: 3, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 3, row: 5, height: 0, color: "red" });
		// White at (7, 7) with only ONE red neighbour at (6, 7) — does NOT count.
		b = setPiece(b, { col: 7, row: 7, height: 0, color: "white" });
		b = setPiece(b, { col: 6, row: 7, height: 0, color: "red" });
		const f = computeFeatures(gs(b, "red"), "red");
		expect(f.funnel_pressure).toBe(1);
	});

	it("total_pieces_advancement credits buried pieces", () => {
		let b = emptyBoard();
		// Red 2-stack at row 5 (red goal = row 10, distanceToward = 5).
		// Each piece contributes 5; 2 pieces → 2 × 5 = 10. But the cell
		// is counted ONCE for forward_progress (only the top counts) so
		// forward_progress = 5 and total_pieces_advancement = 10.
		b = setPiece(b, { col: 4, row: 5, height: 0, color: "red" });
		b = setPiece(b, { col: 4, row: 5, height: 1, color: "red" });
		const f = computeFeatures(gs(b, "red"), "red");
		expect(f.forward_progress).toBe(5);
		expect(f.total_pieces_advancement).toBe(10);
	});

	it("frontier_advance is the max distance-toward-goal of any owned top", () => {
		let b = emptyBoard();
		// Red tops at rows 1, 4, 7. distanceToward(row=1)=1, =4=4, =7=7.
		// Max = 7.
		b = setPiece(b, { col: 0, row: 1, height: 0, color: "red" });
		b = setPiece(b, { col: 1, row: 4, height: 0, color: "red" });
		b = setPiece(b, { col: 2, row: 7, height: 0, color: "red" });
		const f = computeFeatures(gs(b, "red"), "red");
		expect(f.frontier_advance).toBe(7);
	});
});

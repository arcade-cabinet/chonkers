/**
 * Feature extraction over `GameState` per docs/AI.md "Feature vector".
 *
 * Each feature is a pure function of the board (and the player's
 * colour, where it matters). All feature values are real-valued; the
 * `evaluate` function in `./evaluation.ts` computes the weighted sum
 * `sum(features[k] * profile.weights[k])`.
 *
 * Features are computed PER MOVE during alpha-beta search, so they
 * must be cheap. We avoid materialising stacks more than once per
 * cell by walking the board exactly once and collecting per-cell
 * stats in a single pass.
 */

import {
	adjacentCells,
	type Board,
	type Cell,
	type Color,
	type GameState,
	opponentHomeRow,
	stackHeight,
	topPieceAt,
} from "@/engine";

/** All ten feature values per docs/AI.md. */
export interface FeatureValues {
	readonly forward_progress: number;
	readonly top_count: number;
	readonly home_row_tops: number;
	readonly chonk_opportunities: number;
	readonly tall_stack_count: number;
	readonly blocker_count: number;
	readonly chain_owed: number;
	readonly opponent_forward_progress: number;
	readonly opponent_home_row_tops: number;
	readonly opponent_tall_stacks_unblocked: number;
}

/**
 * Per-cell summary built in a single pass over the board, then
 * consumed by every feature function. Avoids re-iterating `board`
 * once per feature.
 */
interface CellSummary {
	readonly cell: Cell;
	readonly height: number;
	readonly topColor: Color;
}

function summariseCells(board: Board): CellSummary[] {
	// Group pieces by (col, row), tracking max height + colour at top.
	const byCell = new Map<
		string,
		{ topHeight: number; topColor: Color; height: number }
	>();
	for (const piece of board.values()) {
		const k = `${piece.col}:${piece.row}`;
		const prev = byCell.get(k);
		if (!prev) {
			byCell.set(k, {
				topHeight: piece.height,
				topColor: piece.color,
				height: 1,
			});
		} else {
			const newHeight = prev.height + 1;
			if (piece.height > prev.topHeight) {
				byCell.set(k, {
					topHeight: piece.height,
					topColor: piece.color,
					height: newHeight,
				});
			} else {
				byCell.set(k, { ...prev, height: newHeight });
			}
		}
	}
	const out: CellSummary[] = [];
	for (const [k, v] of byCell) {
		const [col, row] = k.split(":").map(Number);
		out.push({
			cell: { col: col as number, row: row as number },
			height: v.height,
			topColor: v.topColor,
		});
	}
	return out;
}

const TALL_STACK_THRESHOLD = 3;

/**
 * Compute every feature for `player` against `state`. Returns a
 * dense FeatureValues record.
 */
export function computeFeatures(
	state: GameState,
	player: Color,
): FeatureValues {
	const opponent: Color = player === "red" ? "white" : "red";
	const goal = opponentHomeRow(player);
	const oppGoal = opponentHomeRow(opponent);
	const summary = summariseCells(state.board);

	let forward_progress = 0;
	let top_count = 0;
	let home_row_tops = 0;
	let tall_stack_count = 0;
	let blocker_count = 0;
	let opponent_forward_progress = 0;
	let opponent_home_row_tops = 0;
	let opponent_tall_stacks_unblocked = 0;
	let chonk_opportunities = 0;

	const playerCells: Cell[] = [];
	const opponentTallCells: Array<{ cell: Cell; height: number }> = [];

	for (const s of summary) {
		if (s.topColor === player) {
			playerCells.push(s.cell);
			// Forward progress = how far this top has advanced toward goal.
			forward_progress += distanceToward(s.cell, goal);
			top_count += 1;
			if (s.cell.row === goal) home_row_tops += 1;
			if (s.height >= TALL_STACK_THRESHOLD) tall_stack_count += 1;
		} else if (s.topColor === opponent) {
			opponent_forward_progress += distanceToward(s.cell, oppGoal);
			if (s.cell.row === oppGoal) opponent_home_row_tops += 1;
			if (s.height >= TALL_STACK_THRESHOLD) {
				opponentTallCells.push({ cell: s.cell, height: s.height });
			}
		}
	}

	// Blocker count: the player's 1-stacks adjacent to opponent tall stacks.
	const playerOneStacks = summary.filter(
		(s) => s.topColor === player && s.height === 1,
	);
	const playerOneSet = new Set(
		playerOneStacks.map((s) => `${s.cell.col}:${s.cell.row}`),
	);

	for (const opp of opponentTallCells) {
		const adj = adjacentCells(opp.cell);
		const blocked = adj.some((a) => playerOneSet.has(`${a.col}:${a.row}`));
		if (!blocked) opponent_tall_stacks_unblocked += 1;
		for (const a of adj) {
			if (playerOneSet.has(`${a.col}:${a.row}`)) blocker_count += 1;
		}
	}

	// Chonk opportunities: legal chonks the player can make this turn.
	for (const cell of playerCells) {
		const myH = stackHeight(state.board, cell);
		for (const adj of adjacentCells(cell)) {
			const top = topPieceAt(state.board, adj);
			if (!top) continue; // empty cells are reachable but not chonks
			if (top.color === player) continue; // chonking own colour is mostly perf-irrelevant
			const adjH = stackHeight(state.board, adj);
			if (myH <= adjH) chonk_opportunities += 1;
		}
	}

	const chain_owed = state.chain
		? state.chain.remainingDetachments.reduce((acc, d) => acc + d.length, 0)
		: 0;

	return {
		forward_progress,
		top_count,
		home_row_tops,
		chonk_opportunities,
		tall_stack_count,
		blocker_count,
		chain_owed,
		opponent_forward_progress,
		opponent_home_row_tops,
		opponent_tall_stacks_unblocked,
	};
}

/**
 * Rows-toward-goal — high values mean closer to the player's goal
 * row. For red (goal=10), distanceToward(row=10) = 10. For white
 * (goal=0), distanceToward(row=0) = 10.
 */
function distanceToward(cell: Cell, goalRow: number): number {
	return goalRow === 0 ? 10 - cell.row : cell.row;
}

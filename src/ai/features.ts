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
} from "@/engine";

/** Feature vector per docs/AI.md "Feature vector". */
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
	/**
	 * Sum over owned cells of `stack_height × distance_toward_goal`.
	 * Credits BURIED pieces, not just tops, so building 2-stacks and
	 * pushing them forward is rewarded — counters the row-N standoff
	 * where every side stays on 1-stacks because top_count + forward
	 * locally maximise but the wall never breaks.
	 */
	readonly total_pieces_advancement: number;
	/**
	 * Count of owned stacks with height ≥ 2 (i.e. mobile splittable
	 * threats). A 2-stack can chonk a 2-stack, an N-stack can chonk
	 * an N-or-taller; without these the player has no offensive
	 * piece-capture leverage. Heavily rewarded so the AI builds
	 * tall stacks instead of staying flat.
	 */
	readonly mobile_threat_count: number;
	/**
	 * Maximum distance-toward-goal of any owned top. Pushes the AI
	 * to commit at least one piece across the centre line — a
	 * salient lone advancer creates threats the opponent must
	 * answer instead of mirroring.
	 */
	readonly frontier_advance: number;
	/**
	 * Count of opponent's owned 1-stacks adjacent to one of OUR
	 * 1-stacks. Each such pair is a free even trade (1-stack onto
	 * 1-stack chonk is legal, lifts a 2-stack with our colour on
	 * top). Strongly rewarded so the AI executes those trades
	 * instead of mirroring sideways.
	 */
	readonly even_trade_count: number;
	/**
	 * Count of unordered (own, own) cell pairs within Chebyshev-1.
	 * Rewards keeping pieces clustered — defensive walls, mutual
	 * support — instead of scattered. Defensive disposition values
	 * this most. (We count each pair once: only when adj's key
	 * sorts greater than self's key, halving the iteration.)
	 */
	readonly cluster_density: number;
	/**
	 * Length of the longest contiguous horizontal run of own owned
	 * cells on a single row. Wall formations restrict opponent's
	 * advance lanes. Rewarded for defensive postures.
	 */
	readonly longest_wall: number;
	/**
	 * Count of opponent's owned cells with ≥ 2 of our pieces in the
	 * Chebyshev-1 neighbourhood. These are funnel/encirclement
	 * targets — pieces being pushed where we want them. Rewarded
	 * for aggressive postures.
	 */
	readonly funnel_pressure: number;
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
	// Index the summary by cell key so chonk_opportunities and
	// adjacency lookups can read heights + colours in O(1) per cell
	// instead of rescanning the whole board through stackHeight /
	// topPieceAt — this function is on the alpha-beta hot path and
	// the duplicate-scan cost cancels out the single-pass summary.
	const summaryByCell = new Map<string, CellSummary>(
		summary.map((s) => [`${s.cell.col}:${s.cell.row}`, s] as const),
	);

	let forward_progress = 0;
	let top_count = 0;
	let home_row_tops = 0;
	let tall_stack_count = 0;
	let blocker_count = 0;
	let opponent_forward_progress = 0;
	let opponent_home_row_tops = 0;
	let opponent_tall_stacks_unblocked = 0;
	let chonk_opportunities = 0;
	let total_pieces_advancement = 0;
	let mobile_threat_count = 0;
	let frontier_advance = 0;

	const playerCells: Cell[] = [];
	const opponentTallCells: Array<{ cell: Cell; height: number }> = [];
	const playerOnesByCell = new Set<string>();
	const opponentOnesByCell = new Set<string>();

	for (const s of summary) {
		if (s.topColor === player) {
			playerCells.push(s.cell);
			const adv = distanceToward(s.cell, goal);
			forward_progress += adv;
			total_pieces_advancement += s.height * adv;
			if (adv > frontier_advance) frontier_advance = adv;
			top_count += 1;
			if (s.cell.row === goal) home_row_tops += 1;
			if (s.height >= TALL_STACK_THRESHOLD) tall_stack_count += 1;
			if (s.height >= 2) mobile_threat_count += 1;
			if (s.height === 1) {
				playerOnesByCell.add(`${s.cell.col}:${s.cell.row}`);
			}
		} else if (s.topColor === opponent) {
			opponent_forward_progress += distanceToward(s.cell, oppGoal);
			if (s.cell.row === oppGoal) opponent_home_row_tops += 1;
			if (s.height >= TALL_STACK_THRESHOLD) {
				opponentTallCells.push({ cell: s.cell, height: s.height });
			}
			if (s.height === 1) {
				opponentOnesByCell.add(`${s.cell.col}:${s.cell.row}`);
			}
		}
	}

	// Build owned-cell sets for adjacency-aware features.
	const playerOwnedSet = new Set(
		playerCells.map((c) => `${c.col}:${c.row}`),
	);
	const opponentOwnedCells: Cell[] = [];
	for (const s of summary) {
		if (s.topColor === opponent) opponentOwnedCells.push(s.cell);
	}

	// Even trade count: every adjacency of a player 1-stack to an
	// opponent 1-stack is a free chonk (1-stack onto 1-stack legal,
	// produces a player-owned 2-stack on the opponent's prior cell).
	// We count UNORDERED pairs (each adjacency from the player side).
	let even_trade_count = 0;
	for (const cellKey of playerOnesByCell) {
		const [c, r] = cellKey.split(":").map(Number);
		const cell: Cell = { col: c as number, row: r as number };
		for (const adj of adjacentCells(cell)) {
			if (opponentOnesByCell.has(`${adj.col}:${adj.row}`)) {
				even_trade_count += 1;
			}
		}
	}

	// Cluster density: unordered own-own adjacency pairs. Iterate
	// playerCells; for each, count adjacents that are also player-
	// owned AND have a strictly-greater (col, row) lexicographic key
	// to halve double-counting.
	let cluster_density = 0;
	for (const cell of playerCells) {
		const myKey = `${cell.col}:${cell.row}`;
		for (const adj of adjacentCells(cell)) {
			const adjKey = `${adj.col}:${adj.row}`;
			if (playerOwnedSet.has(adjKey) && adjKey > myKey) {
				cluster_density += 1;
			}
		}
	}

	// Longest horizontal wall: per-row, find max contiguous owned
	// columns.
	let longest_wall = 0;
	const cellsByRow = new Map<number, number[]>();
	for (const cell of playerCells) {
		const arr = cellsByRow.get(cell.row);
		if (arr) arr.push(cell.col);
		else cellsByRow.set(cell.row, [cell.col]);
	}
	for (const cols of cellsByRow.values()) {
		cols.sort((a, b) => a - b);
		let run = 1;
		let best = 1;
		for (let i = 1; i < cols.length; i += 1) {
			if (cols[i] === (cols[i - 1] as number) + 1) {
				run += 1;
				if (run > best) best = run;
			} else {
				run = 1;
			}
		}
		if (best > longest_wall) longest_wall = best;
	}

	// Funnel pressure: opponent cells with ≥ 2 player neighbours.
	let funnel_pressure = 0;
	for (const oppCell of opponentOwnedCells) {
		let neighbourCount = 0;
		for (const adj of adjacentCells(oppCell)) {
			if (playerOwnedSet.has(`${adj.col}:${adj.row}`)) {
				neighbourCount += 1;
				if (neighbourCount >= 2) {
					funnel_pressure += 1;
					break;
				}
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
		const me = summaryByCell.get(`${cell.col}:${cell.row}`);
		if (!me) continue;
		const myH = me.height;
		for (const adj of adjacentCells(cell)) {
			const adjSummary = summaryByCell.get(`${adj.col}:${adj.row}`);
			if (!adjSummary) continue; // empty cell — not a chonk
			if (adjSummary.topColor === player) continue;
			if (myH <= adjSummary.height) chonk_opportunities += 1;
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
		total_pieces_advancement,
		mobile_threat_count,
		frontier_advance,
		even_trade_count,
		cluster_density,
		longest_wall,
		funnel_pressure,
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

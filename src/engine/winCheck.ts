/**
 * Win check per RULES.md §1 + §7.
 *
 * A player wins when EVERY one of their owned cells (top-of-stack
 * matches their colour) sits on the OPPOSITE home row simultaneously.
 * The check runs after a move resolves, before control flips.
 *
 * Edge cases handled:
 *   - 0 owned cells → not a win (the player has no surviving towers)
 *   - Both players satisfy the win simultaneously → moving player
 *     wins (RULES.md §7's "Both win conditions trigger on the same
 *     move" tie-break). The reducer in `./moves.ts` consults this
 *     after applying the action, so it knows who moved.
 */

import { ownedCells } from "./board";
import { opponentHomeRow } from "./positions";
import type { Board, Color } from "./types";

/**
 * True iff every cell the player owns sits on their goal row.
 * Returns false when the player owns zero cells (a player with no
 * remaining towers cannot win).
 */
export function playerSatisfiesWin(board: Board, player: Color): boolean {
	const owned = ownedCells(board, player);
	if (owned.length === 0) return false;
	const goal = opponentHomeRow(player);
	return owned.every((cell) => cell.row === goal);
}

/**
 * Resolve who has won, with the moving-player tie-break per RULES §7.
 *
 *   - Both satisfy → moving player wins (the move that triggered the
 *     simultaneous condition is what produced the dual-win state).
 *   - Only one satisfies → that player wins.
 *   - Neither satisfies → null (game continues).
 */
export function resolveWinner(board: Board, movingPlayer: Color): Color | null {
	const redWin = playerSatisfiesWin(board, "red");
	const whiteWin = playerSatisfiesWin(board, "white");
	if (redWin && whiteWin) return movingPlayer;
	if (redWin) return "red";
	if (whiteWin) return "white";
	return null;
}

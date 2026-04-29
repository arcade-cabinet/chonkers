/**
 * `moves` repo — typed append-only access to the moves table.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Moves are inserted live during the match (one INSERT per ply). The
 * sim broker calls `appendMove` after every legal move in the engine.
 * There is no `updateMove` — moves are immutable once recorded.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import {
	type Move,
	type MoveColor,
	moves,
	type NewMove,
} from "@/persistence/sqlite/schema";
import type { StoreDb } from "../types";

export interface AppendMoveInput {
	readonly matchId: string;
	readonly ply: number;
	readonly color: MoveColor;
	readonly fromCol: number;
	readonly fromRow: number;
	readonly toCol: number;
	readonly toRow: number;
	readonly stackHeightAfter: number;
	readonly positionHashAfter: string;
	readonly sliceIndicesJson?: string;
	readonly moveDurationMs?: number;
	readonly createdAt?: number;
}

/**
 * Insert a single move. Composite primary key (match_id, ply) means
 * inserting the same (match_id, ply) twice is a constraint error —
 * the engine guarantees ply monotonicity, so duplicates are a bug.
 */
export async function appendMove(
	db: StoreDb,
	input: AppendMoveInput,
): Promise<Move> {
	const row: NewMove = {
		matchId: input.matchId,
		ply: input.ply,
		color: input.color,
		fromCol: input.fromCol,
		fromRow: input.fromRow,
		toCol: input.toCol,
		toRow: input.toRow,
		stackHeightAfter: input.stackHeightAfter,
		positionHashAfter: input.positionHashAfter,
		...(input.sliceIndicesJson !== undefined
			? { sliceIndicesJson: input.sliceIndicesJson }
			: {}),
		...(input.moveDurationMs !== undefined
			? { moveDurationMs: input.moveDurationMs }
			: {}),
		...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
	};
	await db.insert(moves).values(row);
	const inserted = await getMove(db, input.matchId, input.ply);
	if (!inserted) {
		throw new Error(
			`appendMove: insert succeeded but row (${input.matchId}, ${input.ply}) missing`,
		);
	}
	return inserted;
}

/** Return a single move by composite primary key. */
export async function getMove(
	db: StoreDb,
	matchId: string,
	ply: number,
): Promise<Move | null> {
	const rows = await db
		.select()
		.from(moves)
		.where(and(eq(moves.matchId, matchId), eq(moves.ply, ply)));
	return rows[0] ?? null;
}

/** All moves in a match, ordered by ply ascending. */
export async function listMovesByMatch(
	db: StoreDb,
	matchId: string,
): Promise<Move[]> {
	return db
		.select()
		.from(moves)
		.where(eq(moves.matchId, matchId))
		.orderBy(asc(moves.ply));
}

/** Most recent move in a match, or null if no moves yet. */
export async function latestMoveByMatch(
	db: StoreDb,
	matchId: string,
): Promise<Move | null> {
	const rows = await db
		.select()
		.from(moves)
		.where(eq(moves.matchId, matchId))
		.orderBy(desc(moves.ply))
		.limit(1);
	return rows[0] ?? null;
}

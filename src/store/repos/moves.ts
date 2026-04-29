/**
 * `moves` repo — typed append-only access to the moves table.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Moves are inserted live during the match (one INSERT per ply). The
 * sim broker calls `appendMove` after every legal move in the engine.
 * There is no `updateMove` — moves are immutable once recorded.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
	type Move,
	type MoveColor,
	matches,
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
 * Build the `{ field: value }` slice for the three optional columns,
 * suppressing keys whose input value is `undefined`. drizzle's `values`
 * helper treats `undefined` and "key absent" differently for nullable
 * columns — we want the latter (DEFAULT NULL) on every optional input.
 */
function optionalMoveFields(
	input: Pick<
		AppendMoveInput,
		"sliceIndicesJson" | "moveDurationMs" | "createdAt"
	>,
): Partial<NewMove> {
	return {
		...(input.sliceIndicesJson !== undefined
			? { sliceIndicesJson: input.sliceIndicesJson }
			: {}),
		...(input.moveDurationMs !== undefined
			? { moveDurationMs: input.moveDurationMs }
			: {}),
		...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
	};
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
		...optionalMoveFields(input),
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

/**
 * Insert a move and bump `matches.ply_count` in one atomic step.
 *
 * Implementation: a single `UPDATE matches SET ply_count = ply_count + 1
 * WHERE id = ? RETURNING ply_count - 1 AS ply` claims a ply slot.
 * SQLite serialises UPDATE-RETURNING at the engine level for the
 * embedded sqlite-proxy / better-sqlite3 backends used here, so
 * concurrent callers cannot pick the same ply. (Note: this argument
 * does NOT carry to a remote-server sqlite-proxy adapter — chonkers
 * uses the embedded capacitor-sqlite plugin and Node better-sqlite3
 * for tests, both of which serialise writes at the file level.)
 *
 * If the subsequent INSERT throws, the matches.ply_count bump is
 * preserved — leaving `ply_count` one ahead of the move log. The
 * broker treats appendMove failures as fatal (the match is aborted
 * and `finishedAt` stays null, so analytics' `refreshOnMatchEnd`
 * skips it), so the invariant we protect is "ply_count is never
 * BEHIND the move log"; "ply_count one ahead after a fatal abort"
 * is inert.
 *
 * Avoids drizzle's `db.transaction()`, which is incompatible across
 * runtimes: drizzle-orm/better-sqlite3 forbids async tx callbacks
 * (the Node test tier), drizzle-orm/sqlite-proxy requires them (the
 * capacitor-sqlite runtime tier). The single-statement claim works
 * on both.
 */
export async function appendMoveAndBumpPly(
	db: StoreDb,
	input: Omit<AppendMoveInput, "ply">,
): Promise<Move> {
	const claimed = await db
		.update(matches)
		.set({ plyCount: sql`${matches.plyCount} + 1` })
		.where(eq(matches.id, input.matchId))
		.returning({ ply: sql<number>`${matches.plyCount} - 1` });
	const claim = claimed[0];
	if (!claim) {
		throw new Error(`appendMoveAndBumpPly: no match ${input.matchId}`);
	}
	const ply = Number(claim.ply);
	const row: NewMove = {
		matchId: input.matchId,
		ply,
		color: input.color,
		fromCol: input.fromCol,
		fromRow: input.fromRow,
		toCol: input.toCol,
		toRow: input.toRow,
		stackHeightAfter: input.stackHeightAfter,
		positionHashAfter: input.positionHashAfter,
		...optionalMoveFields(input),
	};
	await db.insert(moves).values(row);
	const inserted = await getMove(db, input.matchId, ply);
	if (!inserted) {
		throw new Error(
			`appendMoveAndBumpPly: insert succeeded but row (${input.matchId}, ${ply}) missing`,
		);
	}
	return inserted;
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

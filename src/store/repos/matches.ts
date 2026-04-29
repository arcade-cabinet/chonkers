/**
 * `matches` repo — typed CRUD over the matches table.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Each function takes the drizzle handle as its first argument so
 * callers can compose them inside transactions (see `db.transaction`
 * in drizzle docs). No singleton shortcuts; the broker passes the handle.
 */

import { desc, eq } from "drizzle-orm";
import {
	type Match,
	matches,
	type NewMatch,
	type Winner,
} from "@/persistence/sqlite/schema";
import type { StoreDb } from "../types";

export interface CreateMatchInput {
	readonly id: string;
	readonly redProfile: string;
	readonly whiteProfile: string;
	readonly openingPositionHash: string;
	readonly coinFlipSeed: string;
	readonly startedAt?: number;
}

/**
 * Insert a new match row in the in-progress state. `finishedAt` and
 * `winner` are null until the match concludes.
 */
export async function createMatch(
	db: StoreDb,
	input: CreateMatchInput,
): Promise<Match> {
	const row: NewMatch = {
		id: input.id,
		redProfile: input.redProfile,
		whiteProfile: input.whiteProfile,
		openingPositionHash: input.openingPositionHash,
		coinFlipSeed: input.coinFlipSeed,
		...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
	};
	await db.insert(matches).values(row);
	const created = await getMatch(db, input.id);
	if (!created) {
		throw new Error(
			`createMatch: insert succeeded but row ${input.id} missing`,
		);
	}
	return created;
}

/** Return the match row, or null if no row with that id exists. */
export async function getMatch(db: StoreDb, id: string): Promise<Match | null> {
	const rows = await db.select().from(matches).where(eq(matches.id, id));
	return rows[0] ?? null;
}

/**
 * List every match, newest-finished first (with in-progress matches
 * appearing first because their `finished_at` is null and SQLite sorts
 * nulls before non-nulls under DESC).
 */
export async function listMatches(db: StoreDb): Promise<Match[]> {
	return db.select().from(matches).orderBy(desc(matches.finishedAt));
}

/**
 * Mark a match concluded with the given winner. Sets `finished_at` to
 * the provided timestamp (defaulting to now).
 */
export async function finalizeMatch(
	db: StoreDb,
	id: string,
	winner: Winner,
	finishedAt: number = Date.now(),
): Promise<void> {
	await db
		.update(matches)
		.set({ winner, finishedAt })
		.where(eq(matches.id, id));
}

/**
 * Forfeit a match. The forfeiting side becomes the loser; the winner
 * is the OPPOSITE colour (so `forfeit-red` means red gave up and white
 * won). The sim broker triggers the standard game-over sting plus the
 * winner's voice line.
 */
export async function forfeit(
	db: StoreDb,
	id: string,
	forfeitingColor: "red" | "white",
	finishedAt: number = Date.now(),
): Promise<void> {
	const winner: Winner =
		forfeitingColor === "red" ? "forfeit-red" : "forfeit-white";
	await finalizeMatch(db, id, winner, finishedAt);
}

/**
 * Record an active forced split chain on the match. Called when the
 * player begins a non-contiguous split that spans multiple turns
 * (RULES.md §5.4). `chainRemainingJson` is the serialised array of
 * contiguous-run slice index arrays still owed.
 */
export async function setChain(
	db: StoreDb,
	id: string,
	chainSourceCol: number,
	chainSourceRow: number,
	chainRemainingJson: string,
): Promise<void> {
	await db
		.update(matches)
		.set({
			chainSourceCol,
			chainSourceRow,
			chainRemainingJson,
		})
		.where(eq(matches.id, id));
}

/** Clear the active chain on the match (the chain finished or was abandoned). */
export async function clearChain(db: StoreDb, id: string): Promise<void> {
	await db
		.update(matches)
		.set({
			chainSourceCol: null,
			chainSourceRow: null,
			chainRemainingJson: null,
		})
		.where(eq(matches.id, id));
}

/**
 * Increment the denormalised ply counter by 1. Called on every move
 * insert to keep `analytics_aggregates` joins fast at rc-stage scale.
 */
export async function incrementPly(db: StoreDb, id: string): Promise<void> {
	const row = await getMatch(db, id);
	if (!row) throw new Error(`incrementPly: no match ${id}`);
	await db
		.update(matches)
		.set({ plyCount: row.plyCount + 1 })
		.where(eq(matches.id, id));
}

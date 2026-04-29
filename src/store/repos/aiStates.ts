/**
 * `ai_states` repo — typed upsert/read access to AI dump snapshots.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Composite primary key (match_id, profile_key) — replace-not-append.
 * A new dump for the same key overwrites the previous row.
 */

import { and, eq, sql } from "drizzle-orm";
import {
	type AiStateRow,
	aiStates,
	type NewAiStateRow,
} from "@/persistence/sqlite/schema";
import type { StoreDb } from "../types";

export interface UpsertAiDumpInput {
	readonly matchId: string;
	readonly profileKey: string;
	readonly ply: number;
	readonly dumpBlob: Uint8Array;
	readonly dumpFormatVersion: number;
	readonly createdAt?: number;
}

/**
 * Upsert an AI dump for (matchId, profileKey). Replaces the previous
 * row entirely if one exists.
 */
export async function upsertDump(
	db: StoreDb,
	input: UpsertAiDumpInput,
): Promise<AiStateRow> {
	const buffer = Buffer.from(
		input.dumpBlob.buffer,
		input.dumpBlob.byteOffset,
		input.dumpBlob.byteLength,
	);
	const row: NewAiStateRow = {
		matchId: input.matchId,
		profileKey: input.profileKey,
		ply: input.ply,
		dumpBlob: buffer,
		dumpFormatVersion: input.dumpFormatVersion,
		...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
	};
	await db
		.insert(aiStates)
		.values(row)
		.onConflictDoUpdate({
			target: [aiStates.matchId, aiStates.profileKey],
			set: {
				ply: sql`excluded.ply`,
				dumpBlob: sql`excluded.dump_blob`,
				dumpFormatVersion: sql`excluded.dump_format_version`,
				createdAt: sql`excluded.created_at`,
			},
		});
	const stored = await getDump(db, input.matchId, input.profileKey);
	if (!stored) {
		throw new Error(
			`upsertDump: upsert succeeded but row (${input.matchId}, ${input.profileKey}) missing`,
		);
	}
	return stored;
}

/**
 * Read the latest dump for (matchId, profileKey). Primary-key
 * point read — single row or null.
 */
export async function getDump(
	db: StoreDb,
	matchId: string,
	profileKey: string,
): Promise<AiStateRow | null> {
	const rows = await db
		.select()
		.from(aiStates)
		.where(
			and(eq(aiStates.matchId, matchId), eq(aiStates.profileKey, profileKey)),
		);
	return rows[0] ?? null;
}

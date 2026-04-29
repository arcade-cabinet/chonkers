/**
 * `ai_states` — latest AI dump_blob per match per profile.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Composite PK (match_id, profile_key). Replace-not-append: a new dump
 * for the same key overwrites the previous row via INSERT ... ON
 * CONFLICT DO UPDATE in `aiStatesRepo.upsertDump`.
 *
 * For human players (profile_key = 'human') no row is ever written.
 * The schema permits it for symmetry; the store layer never produces one.
 */

import {
	blob,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { matches } from "./matches";

export const aiStates = sqliteTable(
	"ai_states",
	{
		matchId: text("match_id")
			.notNull()
			.references(() => matches.id, { onDelete: "cascade" }),
		profileKey: text("profile_key").notNull(),
		ply: integer("ply").notNull(),
		dumpBlob: blob("dump_blob", { mode: "buffer" }).notNull(),
		dumpFormatVersion: integer("dump_format_version").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.matchId, t.profileKey] }),
	}),
);

export type AiStateRow = typeof aiStates.$inferSelect;
export type NewAiStateRow = typeof aiStates.$inferInsert;

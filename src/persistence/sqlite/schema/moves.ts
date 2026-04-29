/**
 * `moves` — one row per ply.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Composite PK (match_id, ply). FK ON DELETE CASCADE so deleting a
 * match wipes its move history. Inserted live during the match — one
 * INSERT per ply — see docs/DB.md "moves" notes.
 */

import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { matches } from "./matches";

export const moves = sqliteTable(
	"moves",
	{
		matchId: text("match_id")
			.notNull()
			.references(() => matches.id, { onDelete: "cascade" }),
		ply: integer("ply").notNull(),
		color: text("color").notNull(),
		fromCol: integer("from_col").notNull(),
		fromRow: integer("from_row").notNull(),
		toCol: integer("to_col").notNull(),
		toRow: integer("to_row").notNull(),
		sliceIndicesJson: text("slice_indices_json"),
		stackHeightAfter: integer("stack_height_after").notNull(),
		positionHashAfter: text("position_hash_after").notNull(),
		moveDurationMs: integer("move_duration_ms").notNull().default(0),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.matchId, t.ply] }),
	}),
);

export type Move = typeof moves.$inferSelect;
export type NewMove = typeof moves.$inferInsert;

/** `red` and `white` are the only legal values for `color`. */
export type MoveColor = "red" | "white";

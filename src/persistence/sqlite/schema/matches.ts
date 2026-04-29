/**
 * `matches` — one row per played game.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Columns + indices below mirror the spec there. Any divergence is a
 * documentation bug; treat the doc as the source of truth.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const matches = sqliteTable(
	"matches",
	{
		id: text("id").primaryKey(),
		startedAt: integer("started_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		finishedAt: integer("finished_at"),
		winner: text("winner"),
		redProfile: text("red_profile").notNull(),
		whiteProfile: text("white_profile").notNull(),
		openingPositionHash: text("opening_position_hash").notNull(),
		coinFlipSeed: text("coin_flip_seed").notNull(),
		chainSourceCol: integer("chain_source_col"),
		chainSourceRow: integer("chain_source_row"),
		chainRemainingJson: text("chain_remaining_json"),
		plyCount: integer("ply_count").notNull().default(0),
	},
	(t) => ({
		idxFinishedAt: index("idx_matches_finished_at").on(t.finishedAt),
		idxProfiles: index("idx_matches_profiles").on(t.redProfile, t.whiteProfile),
	}),
);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;

/**
 * Permitted values for `winner`. Null means in-progress. The four
 * non-null values cover normal terminal states (red or white reaches
 * the opponent's home row) plus forfeit terminal states (recorded as
 * `forfeit-<color>` to indicate which player gave up — the OPPOSITE
 * player's victory voice line plays).
 */
export type Winner = "red" | "white" | "forfeit-red" | "forfeit-white";

/**
 * Convenience SQL fragment for "matches still in progress" — used by
 * resume flows and analytics queries that should ignore unfinished
 * games.
 */
export const inProgressMatch = sql`${matches.finishedAt} IS NULL`;

/**
 * `analytics_aggregates` — materialised aggregate rows.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * Refreshed by the sim broker on match-end (and on match-forfeit). One
 * row per `aggregate_key`. The catalogue of aggregate keys + the
 * refresh logic per family lives in `src/analytics/`.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { matches } from "./matches";

export const analyticsAggregates = sqliteTable("analytics_aggregates", {
	aggregateKey: text("aggregate_key").primaryKey(),
	valueJson: text("value_json").notNull(),
	sampleCount: integer("sample_count").notNull(),
	lastMatchId: text("last_match_id").references(() => matches.id, {
		onDelete: "set null",
	}),
	refreshedAt: integer("refreshed_at")
		.notNull()
		.$defaultFn(() => Date.now()),
});

export type AnalyticsAggregate = typeof analyticsAggregates.$inferSelect;
export type NewAnalyticsAggregate = typeof analyticsAggregates.$inferInsert;

/**
 * `analytics_aggregates` repo — typed upsert/read for materialised
 * aggregate rows.
 *
 * Authoritative table catalogue: docs/DB.md.
 *
 * The catalogue of aggregate keys + the refresh logic per family
 * lives in `src/analytics/`. This repo is the transport: write a
 * value, read a value, list a family.
 */

import { eq, like, sql } from "drizzle-orm";
import {
	type AnalyticsAggregate,
	analyticsAggregates,
	type NewAnalyticsAggregate,
} from "@/persistence/sqlite/schema";
import type { StoreDb } from "../types";

export interface UpsertAggregateInput {
	readonly aggregateKey: string;
	readonly valueJson: string;
	readonly sampleCount: number;
	readonly lastMatchId?: string | null;
	readonly refreshedAt?: number;
}

/**
 * Upsert an aggregate row by `aggregateKey`. Replaces the value, the
 * sample count, the last-match pointer, and the refreshed-at timestamp.
 */
export async function upsertAggregate(
	db: StoreDb,
	input: UpsertAggregateInput,
): Promise<AnalyticsAggregate> {
	const row: NewAnalyticsAggregate = {
		aggregateKey: input.aggregateKey,
		valueJson: input.valueJson,
		sampleCount: input.sampleCount,
		...(input.lastMatchId !== undefined
			? { lastMatchId: input.lastMatchId }
			: {}),
		...(input.refreshedAt !== undefined
			? { refreshedAt: input.refreshedAt }
			: {}),
	};
	await db
		.insert(analyticsAggregates)
		.values(row)
		.onConflictDoUpdate({
			target: analyticsAggregates.aggregateKey,
			set: {
				valueJson: sql`excluded.value_json`,
				sampleCount: sql`excluded.sample_count`,
				lastMatchId: sql`excluded.last_match_id`,
				refreshedAt: sql`excluded.refreshed_at`,
			},
		});
	const stored = await getAggregate(db, input.aggregateKey);
	if (!stored) {
		throw new Error(
			`upsertAggregate: upsert succeeded but row ${input.aggregateKey} missing`,
		);
	}
	return stored;
}

/** Read one aggregate row by key. */
export async function getAggregate(
	db: StoreDb,
	aggregateKey: string,
): Promise<AnalyticsAggregate | null> {
	const rows = await db
		.select()
		.from(analyticsAggregates)
		.where(eq(analyticsAggregates.aggregateKey, aggregateKey));
	return rows[0] ?? null;
}

/**
 * List every aggregate row whose key starts with the given family
 * prefix (e.g. `winrate:` matches all win-rate rows). Naming
 * convention is `family:dimension1:dimension2:...` per docs/DB.md.
 */
export async function listByFamily(
	db: StoreDb,
	familyPrefix: string,
): Promise<AnalyticsAggregate[]> {
	return db
		.select()
		.from(analyticsAggregates)
		.where(like(analyticsAggregates.aggregateKey, `${familyPrefix}%`));
}

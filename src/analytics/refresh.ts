/**
 * Aggregate refresh logic.
 *
 * Per docs/DB.md "analytics_aggregates": rows are pre-baked sums
 * over the matches + moves history. The sim broker calls
 * `refreshOnMatchEnd(db, matchId)` after every match's terminal
 * transition (win or forfeit), and the aggregate rows are kept
 * up to date without ever rescanning the full history.
 *
 * Aggregate keys follow `family:dimension1:dimension2:...` per
 * docs/DB.md. This module owns the catalogue of families:
 *
 *   winrate:<red_profile>:vs:<white_profile>
 *     value = { wins_red: N, wins_white: M, forfeits: F }
 *     sample_count = N + M + F
 *
 *   avg_ply_count:overall
 *     value = number (running mean of ply_count across all matches)
 *     sample_count = number of contributing matches
 *
 *   forfeit_rate:by_profile:<profile_key>
 *     value = number (fraction of matches where this profile forfeited)
 *     sample_count = number of matches where this profile played
 *
 * Adding a new aggregate family is a code edit here + the
 * corresponding `refresh*` helper. No schema migration required —
 * the `aggregate_key` column is text and unconstrained.
 */

import { eq } from "drizzle-orm";
import { matches } from "@/persistence/sqlite/schema";
import { analyticsRepo, type StoreDb } from "@/store";

/**
 * Per-DB serializer for `refreshOnMatchEnd`. Each helper inside the
 * refresh rescans `matches` and overwrites the aggregate row, so two
 * overlapping refreshes can interleave their reads + writes and the
 * later writer (which scanned earlier) can clobber the earlier
 * writer's result, regressing the aggregate. Chonkers runs ONE match
 * at a time per device today, but this guard makes the helper safe
 * against any future caller that fires off match terminations in
 * parallel (a batch tournament runner, a replay-many-games tool,
 * etc.). Keyed by drizzle handle identity so multiple test DBs in
 * the same process don't share the lock.
 */
const refreshLocks = new WeakMap<object, Promise<unknown>>();

/**
 * Re-compute every aggregate that this match-end could have changed.
 * Reads are based on the actual `matches` table state — calling
 * twice for the same matchId is idempotent. Sequenced per-DB via
 * `refreshLocks` so concurrent calls cannot regress aggregate rows.
 */
export async function refreshOnMatchEnd(
	db: StoreDb,
	matchId: string,
	now: number = Date.now(),
): Promise<void> {
	const lockKey = db as unknown as object;
	const prior = refreshLocks.get(lockKey) ?? Promise.resolve();
	const next = prior.then(() => refreshOnMatchEndInner(db, matchId, now));
	refreshLocks.set(
		lockKey,
		next.catch(() => undefined),
	);
	return next;
}

async function refreshOnMatchEndInner(
	db: StoreDb,
	matchId: string,
	now: number,
): Promise<void> {
	const rows = await db.select().from(matches).where(eq(matches.id, matchId));
	const match = rows[0];
	if (!match) return;
	if (match.finishedAt == null) return; // not actually ended
	if (!match.winner) return;

	// Sequenced sub-helpers (each reads then writes, so even within
	// a single match-end they must not interleave with each other —
	// the analytics_aggregates row a helper writes is what the next
	// helper would otherwise read concurrently).
	await refreshWinrate(db, match, now);
	await refreshAvgPlyCount(db, now);
	await refreshForfeitRate(db, match.redProfile, now);
	await refreshForfeitRate(db, match.whiteProfile, now);
}

interface MatchRow {
	id: string;
	redProfile: string;
	whiteProfile: string;
	winner: string | null;
	plyCount: number;
}

/**
 * Update the winrate aggregate for the (red_profile, white_profile)
 * pair. Recomputes from `matches` so a duplicate call for the same
 * matchId is idempotent — symmetrical with `refreshAvgPlyCount` and
 * `refreshForfeitRate`, which also rescan rather than incrementing.
 */
async function refreshWinrate(
	db: StoreDb,
	match: MatchRow,
	now: number,
): Promise<void> {
	const key = `winrate:${match.redProfile}:vs:${match.whiteProfile}`;
	const all = await db.select().from(matches);
	let wins_red = 0;
	let wins_white = 0;
	let forfeits = 0;
	for (const m of all) {
		if (m.finishedAt == null) continue;
		if (m.redProfile !== match.redProfile) continue;
		if (m.whiteProfile !== match.whiteProfile) continue;
		if (m.winner === "red") wins_red += 1;
		else if (m.winner === "white") wins_white += 1;
		else if (m.winner?.startsWith("forfeit-")) forfeits += 1;
	}

	await analyticsRepo.upsertAggregate(db, {
		aggregateKey: key,
		valueJson: JSON.stringify({ wins_red, wins_white, forfeits }),
		sampleCount: wins_red + wins_white + forfeits,
		lastMatchId: match.id,
		refreshedAt: now,
	});
}

/** Update the global avg_ply_count aggregate. */
async function refreshAvgPlyCount(db: StoreDb, now: number): Promise<void> {
	const key = "avg_ply_count:overall";
	// Recompute from scratch — it's an overall mean across every
	// finished match, so we read the full set. At rc-stage 10000
	// matches this is still cheap (single SELECT into Node memory).
	const all = await db
		.select({ plyCount: matches.plyCount, finishedAt: matches.finishedAt })
		.from(matches);
	const finished = all.filter((m) => m.finishedAt != null);
	const total = finished.reduce((acc, m) => acc + m.plyCount, 0);
	const sample = finished.length;
	const mean = sample === 0 ? 0 : total / sample;
	await analyticsRepo.upsertAggregate(db, {
		aggregateKey: key,
		valueJson: JSON.stringify(mean),
		sampleCount: sample,
		refreshedAt: now,
	});
}

/** Update the forfeit-rate for a single profile. */
async function refreshForfeitRate(
	db: StoreDb,
	profileKey: string,
	now: number,
): Promise<void> {
	const key = `forfeit_rate:by_profile:${profileKey}`;
	// Count matches where this profile played AND forfeit-<color>
	// matches the colour the profile played. We read everything
	// because forfeit-by-profile is a small relation.
	const all = await db.select().from(matches);
	let played = 0;
	let forfeited = 0;
	for (const m of all) {
		if (m.finishedAt == null) continue;
		const isRed = m.redProfile === profileKey;
		const isWhite = m.whiteProfile === profileKey;
		if (!isRed && !isWhite) continue;
		played += 1;
		if (isRed && m.winner === "forfeit-red") forfeited += 1;
		if (isWhite && m.winner === "forfeit-white") forfeited += 1;
	}
	const rate = played === 0 ? 0 : forfeited / played;
	await analyticsRepo.upsertAggregate(db, {
		aggregateKey: key,
		valueJson: JSON.stringify(rate),
		sampleCount: played,
		refreshedAt: now,
	});
}

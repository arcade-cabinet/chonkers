/**
 * Tuner loss function — quantifies how far a weight vector is from
 * "balanced cross-pairing AI-vs-AI play".
 *
 * For each ordered cross-pairing (red ≠ white), play N matches with
 * deterministic seeds. Compute:
 *   - L1 distance of redWinRate from 0.5 (target = even split)
 *   - Outlier penalty (each unfinished match adds a fixed cost)
 *
 * Sum across all pairings = scalar loss. Lower is better.
 *
 * Same-disposition pairings (agg-vs-agg, etc) deterministically
 * deadlock under the current AI; they're excluded from the loss to
 * avoid penalising the tuner for an artifact of deterministic eval.
 */

import type { Profile } from "@/ai";
import { runMatch } from "./match";

export interface TunerProfileSet {
	readonly aggressive: Profile;
	readonly balanced: Profile;
	readonly defensive: Profile;
}

export interface LossOptions {
	/** Matches per cross-pairing for the loss evaluation. */
	readonly matchesPerPairing?: number;
	/** Penalty added to the loss per unfinished (outlier) match. */
	readonly outlierPenalty?: number;
	/** Per-match ply cap; matches exceeding this count as outliers. */
	readonly plyCap?: number;
	/** Seed prefix for deterministic batch generation. */
	readonly seedPrefix?: string;
}

export interface LossResult {
	readonly loss: number;
	readonly outlierRate: number;
	readonly pairings: ReadonlyArray<{
		readonly red: string;
		readonly white: string;
		readonly redWinRate: number;
		readonly outliers: number;
		readonly matches: number;
	}>;
}

/**
 * Compute the balance loss for a candidate weight set.
 *
 * Iterates the 6 ordered cross-pairings of (aggressive, balanced,
 * defensive). For each pairing, runs `matchesPerPairing` matches with
 * unique deterministic seeds derived from `seedPrefix`. Returns a
 * scalar loss + per-pairing breakdown for diagnostic logging.
 */
export function evaluateLoss(
	profiles: TunerProfileSet,
	options: LossOptions = {},
): LossResult {
	const matchesPerPairing = options.matchesPerPairing ?? 12;
	const outlierPenalty = options.outlierPenalty ?? 1.0;
	const plyCap = options.plyCap ?? 200;
	const seedPrefix = options.seedPrefix ?? "tu";

	const dispositions: ReadonlyArray<
		["aggressive" | "balanced" | "defensive", Profile]
	> = [
		["aggressive", profiles.aggressive],
		["balanced", profiles.balanced],
		["defensive", profiles.defensive],
	];

	const pairings: Array<{
		red: string;
		white: string;
		redWinRate: number;
		outliers: number;
		matches: number;
	}> = [];

	let totalOutliers = 0;
	let totalMatches = 0;
	let loss = 0;

	for (const [redName, redProfile] of dispositions) {
		for (const [whiteName, whiteProfile] of dispositions) {
			if (redName === whiteName) continue; // skip same-disposition deadlocks
			let redWins = 0;
			let whiteWins = 0;
			let outliers = 0;
			for (let i = 0; i < matchesPerPairing; i += 1) {
				const seed =
					`${seedPrefix}${redName[0]}${whiteName[0]}${i.toString(16).padStart(12, "0")}`.slice(
						0,
						16,
					);
				const result = runMatch({
					redProfile,
					whiteProfile,
					coinFlipSeed: seed,
					maxPlies: plyCap,
				});
				if (result.outlier) outliers += 1;
				else if (result.winner === "red") redWins += 1;
				else if (result.winner === "white") whiteWins += 1;
			}
			const finished = redWins + whiteWins;
			const redWinRate = finished > 0 ? redWins / finished : 0.5;
			pairings.push({
				red: redName,
				white: whiteName,
				redWinRate,
				outliers,
				matches: matchesPerPairing,
			});
			loss += Math.abs(redWinRate - 0.5) * 2; // [0, 1] scale
			loss += outliers * outlierPenalty;
			totalOutliers += outliers;
			totalMatches += matchesPerPairing;
		}
	}

	return {
		loss,
		outlierRate: totalOutliers / Math.max(1, totalMatches),
		pairings,
	};
}

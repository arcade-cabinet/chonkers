/**
 * Balance tuner — runs SPSA on aggressive + defensive weights against
 * balanced as fixed baseline, writes tuned weights to
 * `os.tmpdir()/chonkers-tuned-weights.json`.
 *
 * Not a "test" in the assertion sense — it's a long-running
 * optimisation job piggybacking on vitest as the runner. Tagged
 * with the `tuner` vitest project so it doesn't run on every
 * `pnpm test:node`. Triggered via `pnpm tune:balance`.
 *
 * Default ITERATIONS=40, BATCH=12 → ~5760 matches → ~30min on node.
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import { type FeatureWeights, getProfile, type Profile } from "@/ai";
import { evaluateLoss, type TunerProfileSet } from "../loss";
import { type SpsaIterationState, spsa } from "../spsa";

// 17 features; same order as `interface FeatureWeights`.
const FEATURE_KEYS: ReadonlyArray<keyof FeatureWeights> = [
	"forward_progress",
	"top_count",
	"home_row_tops",
	"chonk_opportunities",
	"tall_stack_count",
	"blocker_count",
	"chain_owed",
	"opponent_forward_progress",
	"opponent_home_row_tops",
	"opponent_tall_stacks_unblocked",
	"total_pieces_advancement",
	"mobile_threat_count",
	"frontier_advance",
	"even_trade_count",
	"cluster_density",
	"longest_wall",
	"funnel_pressure",
];

function boundsFor(key: keyof FeatureWeights): readonly [number, number] {
	switch (key) {
		case "chain_owed":
		case "opponent_forward_progress":
		case "opponent_tall_stacks_unblocked":
			return [-8, 0];
		case "opponent_home_row_tops":
			return [-30, 0];
		case "longest_wall":
			return [-2, 8];
		default:
			return [0, 8];
	}
}

function weightsToVector(w: FeatureWeights): number[] {
	return FEATURE_KEYS.map((k) => w[k]);
}

function vectorToWeights(v: ReadonlyArray<number>): FeatureWeights {
	const out: Partial<Record<keyof FeatureWeights, number>> = {};
	for (let i = 0; i < FEATURE_KEYS.length; i += 1) {
		const key = FEATURE_KEYS[i];
		const value = v[i];
		if (key === undefined || value === undefined) continue;
		out[key] = value;
	}
	return out as FeatureWeights;
}

function makeProfile(base: Profile, weights: FeatureWeights): Profile {
	return {
		key: base.key,
		disposition: base.disposition,
		difficulty: base.difficulty,
		weights,
		knobs: base.knobs,
		forfeit: base.forfeit,
	};
}

describe("balance tuner — SPSA over aggressive + defensive weights", () => {
	it(
		"optimises weights to flatten cross-pairing win rates",
		() => {
			const ITERATIONS = Number.parseInt(
				process.env.TUNE_ITERATIONS ?? "40",
				10,
			);
			const BATCH = Number.parseInt(process.env.TUNE_BATCH ?? "12", 10);
			const SEED = Number.parseInt(process.env.TUNE_SEED ?? "42", 10);
			// Default to depth=1 (greedy) for SPSA inner loop — at
			// depth=2 each match is ~7s, so a 5760-match tuner run is
			// ~11h. Depth=1 is ~50-100ms/match → ~10min for the same
			// run. Override with TUNE_DEPTH=2 for a faithful (slow)
			// run. Best-seen weights are validated at TUNE_VALIDATE_DEPTH
			// (default 2) at the end of the run, so the final scoreline
			// reflects governor-tier evaluation.
			const TUNE_DEPTH = Number.parseInt(process.env.TUNE_DEPTH ?? "1", 10);
			const VALIDATE_DEPTH = Number.parseInt(
				process.env.TUNE_VALIDATE_DEPTH ?? "2",
				10,
			);

			const baseAggressive = getProfile("aggressive-easy");
			const baseBalanced = getProfile("balanced-easy");
			const baseDefensive = getProfile("defensive-easy");

			// Param vector layout: [0..16] = aggressive weights;
			// [17..33] = defensive weights. Balanced is held fixed.
			const dim = FEATURE_KEYS.length * 2;
			const theta0 = [
				...weightsToVector(baseAggressive.weights),
				...weightsToVector(baseDefensive.weights),
			];

			const lowerBounds: number[] = [];
			const upperBounds: number[] = [];
			for (let half = 0; half < 2; half += 1) {
				for (const k of FEATURE_KEYS) {
					const [lo, hi] = boundsFor(k);
					lowerBounds.push(lo);
					upperBounds.push(hi);
				}
			}

			function profilesFromTheta(
				theta: ReadonlyArray<number>,
			): TunerProfileSet {
				const aggW = vectorToWeights(theta.slice(0, FEATURE_KEYS.length));
				const defW = vectorToWeights(theta.slice(FEATURE_KEYS.length));
				return {
					aggressive: makeProfile(baseAggressive, aggW),
					balanced: baseBalanced,
					defensive: makeProfile(baseDefensive, defW),
				};
			}

			function lossFn(theta: ReadonlyArray<number>): number {
				const r = evaluateLoss(profilesFromTheta(theta), {
					matchesPerPairing: BATCH,
					plyCap: 200,
					outlierPenalty: 1.0,
					depthOverride: TUNE_DEPTH,
				});
				return r.loss;
			}

			console.log(
				`SPSA tuner: dim=${dim}, iterations=${ITERATIONS}, batch=${BATCH} matches per pairing per eval, depth=${TUNE_DEPTH}, total ~${BATCH * 6 * 2 * ITERATIONS} matches`,
			);

			const startTs = Date.now();
			const onIteration = (state: SpsaIterationState): void => {
				const elapsedSec = ((Date.now() - startTs) / 1000).toFixed(1);
				console.log(
					`iter ${String(state.iteration).padStart(3, " ")}: loss± = ${state.lossPlus.toFixed(3)}/${state.lossMinus.toFixed(3)} (mean ${state.lossEstimate.toFixed(3)}), step=${state.stepSize.toFixed(4)}, perturb=${state.perturbMagnitude.toFixed(4)}, t=${elapsedSec}s`,
				);
			};

			const result = spsa(theta0, lossFn, {
				maxIterations: ITERATIONS,
				lowerBounds,
				upperBounds,
				seed: SEED,
				onIteration,
			});

			// Validate the best-seen weights at higher batch size +
			// validation depth (default 2). This is the "what would the
			// real governor say" check on the tuner's chosen weights.
			const validateBatch = Math.max(BATCH, 24);
			const bestProfiles = profilesFromTheta(result.bestTheta);
			const bestEval = evaluateLoss(bestProfiles, {
				matchesPerPairing: validateBatch,
				plyCap: 200,
				depthOverride: VALIDATE_DEPTH,
			});

			const summary = {
				iterations: ITERATIONS,
				matchesPerPairing: BATCH,
				validateBatch,
				tuneDepth: TUNE_DEPTH,
				validateDepth: VALIDATE_DEPTH,
				seed: SEED,
				durationSec: (Date.now() - startTs) / 1000,
				startWeights: {
					aggressive: baseAggressive.weights,
					defensive: baseDefensive.weights,
				},
				bestLossDuringSearch: result.bestLoss,
				bestEvalAtHigherBatch: {
					loss: bestEval.loss,
					outlierRate: bestEval.outlierRate,
					pairings: bestEval.pairings,
				},
				bestWeights: {
					aggressive: bestProfiles.aggressive.weights,
					defensive: bestProfiles.defensive.weights,
				},
				history: result.history.map((h) => ({
					iteration: h.iteration,
					lossPlus: h.lossPlus,
					lossMinus: h.lossMinus,
					lossEstimate: h.lossEstimate,
					stepSize: h.stepSize,
					perturbMagnitude: h.perturbMagnitude,
				})),
			};

			const outPath = join(tmpdir(), "chonkers-tuned-weights.json");
			writeFileSync(outPath, JSON.stringify(summary, null, 2));

			console.log(`\ndone in ${summary.durationSec.toFixed(1)}s`);
			console.log(`best-seen loss: ${result.bestLoss.toFixed(3)}`);
			console.log(
				`best validated at batch=${validateBatch}: loss=${bestEval.loss.toFixed(3)}, outlierRate=${(bestEval.outlierRate * 100).toFixed(2)}%`,
			);
			console.log(`pairings:`);
			for (const p of bestEval.pairings) {
				console.log(
					`  ${p.red.padEnd(11)} vs ${p.white.padEnd(11)}: redWin=${(p.redWinRate * 100).toFixed(1)}%, outliers=${p.outliers}/${p.matches}`,
				);
			}
			console.log(`\noutput: ${outPath}`);
		},
		// 60min ceiling — well over the ~30min default; lets larger
		// runs (TUNE_ITERATIONS=100, TUNE_BATCH=24) fit.
		60 * 60 * 1000,
	);
});

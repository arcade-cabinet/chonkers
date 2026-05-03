/**
 * Simultaneous Perturbation Stochastic Approximation (SPSA) — a
 * gradient-descent variant that estimates the gradient of a noisy
 * loss function from just TWO loss evaluations per iteration,
 * regardless of the parameter dimension.
 *
 * For our balance-tuning problem the parameter vector has 17 weights
 * × 2 dispositions (aggressive + defensive; balanced is the fixed
 * baseline) = 34 dims. Naive finite-difference would need 35 loss
 * evaluations per gradient step (~70 if central-difference). SPSA
 * needs 2 regardless. With 12 matches per pairing × 6 cross
 * pairings = 72 matches per loss evaluation, SPSA = ~144
 * matches/step vs FD's ~5040. ~35× speedup.
 *
 * Algorithm (Spall 1992):
 *   for each iteration k:
 *     ak = a / (k + 1 + A)^α          # step size
 *     ck = c / (k + 1)^γ                # perturbation magnitude
 *     Δk ∈ {-1, +1}^p uniform random   # perturbation direction
 *     g_hat = (loss(θ + ck*Δk) - loss(θ - ck*Δk)) / (2 * ck) * Δk^-1
 *     θ_{k+1} = θ_k - ak * g_hat
 *
 * Hyperparameters tuned for a [0..6] weight space:
 *   a  = 0.5    # base learning rate
 *   c  = 0.15   # perturbation magnitude
 *   A  = 5      # learning-rate decay damping
 *   α  = 0.602  # standard SPSA exponent
 *   γ  = 0.101  # standard SPSA exponent
 *
 * Constraint handling: weights clipped to [bound_lo, bound_hi]
 * after each update. Negative-only weights (chain_owed,
 * opponent_*) are kept negative via separate bounds.
 */

export interface SpsaOptions {
	readonly maxIterations: number;
	readonly a?: number;
	readonly c?: number;
	readonly A?: number;
	readonly alpha?: number;
	readonly gamma?: number;
	/** Per-dim lower bound. Same length as `theta0`. */
	readonly lowerBounds: ReadonlyArray<number>;
	/** Per-dim upper bound. Same length as `theta0`. */
	readonly upperBounds: ReadonlyArray<number>;
	/** Optional per-iteration callback for progress logging. */
	readonly onIteration?: (state: SpsaIterationState) => void;
	/** Deterministic RNG seed (32-bit) for the random ±1 perturbation. */
	readonly seed?: number;
}

export interface SpsaIterationState {
	readonly iteration: number;
	readonly theta: ReadonlyArray<number>;
	readonly lossPlus: number;
	readonly lossMinus: number;
	readonly lossEstimate: number;
	readonly stepSize: number;
	readonly perturbMagnitude: number;
}

export interface SpsaResult {
	readonly theta: ReadonlyArray<number>;
	readonly bestTheta: ReadonlyArray<number>;
	readonly bestLoss: number;
	readonly history: ReadonlyArray<SpsaIterationState>;
}

/** Mulberry32 — small fast deterministic RNG seeded by an int. */
function makeRng(seed: number): () => number {
	let state = seed | 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function clip(x: number, lo: number, hi: number): number {
	return x < lo ? lo : x > hi ? hi : x;
}

export function spsa(
	theta0: ReadonlyArray<number>,
	loss: (theta: ReadonlyArray<number>) => number,
	options: SpsaOptions,
): SpsaResult {
	const a = options.a ?? 0.5;
	const c = options.c ?? 0.15;
	const A = options.A ?? 5;
	const alpha = options.alpha ?? 0.602;
	const gamma = options.gamma ?? 0.101;
	const rng = makeRng(options.seed ?? 1);

	const dim = theta0.length;
	if (
		options.lowerBounds.length !== dim ||
		options.upperBounds.length !== dim
	) {
		throw new Error(
			`spsa: bounds length mismatch — theta has ${dim} dims; bounds have ${options.lowerBounds.length}/${options.upperBounds.length}`,
		);
	}

	const theta: number[] = theta0.slice();
	let bestTheta: number[] = theta.slice();
	let bestLoss = Number.POSITIVE_INFINITY;
	const history: SpsaIterationState[] = [];

	for (let k = 0; k < options.maxIterations; k += 1) {
		const ak = a / (k + 1 + A) ** alpha;
		const ck = c / (k + 1) ** gamma;

		// Random ±1 perturbation vector. Use plain number[] of length
		// `dim` initialised to a sentinel; each index is overwritten
		// in the loop below before being read elsewhere.
		const delta: number[] = new Array(dim).fill(0);
		for (let i = 0; i < dim; i += 1) delta[i] = rng() < 0.5 ? -1 : 1;

		// theta + ck*delta, theta - ck*delta (clipped to bounds).
		const thetaPlus: number[] = new Array(dim).fill(0);
		const thetaMinus: number[] = new Array(dim).fill(0);
		for (let i = 0; i < dim; i += 1) {
			const t = theta[i] ?? 0;
			const d = delta[i] ?? 0;
			const lo = options.lowerBounds[i] ?? Number.NEGATIVE_INFINITY;
			const hi = options.upperBounds[i] ?? Number.POSITIVE_INFINITY;
			thetaPlus[i] = clip(t + ck * d, lo, hi);
			thetaMinus[i] = clip(t - ck * d, lo, hi);
		}

		const lossPlus = loss(thetaPlus);
		const lossMinus = loss(thetaMinus);
		const lossEstimate = (lossPlus + lossMinus) / 2;

		// Track best-seen.
		if (lossPlus < bestLoss) {
			bestLoss = lossPlus;
			bestTheta = thetaPlus.slice();
		}
		if (lossMinus < bestLoss) {
			bestLoss = lossMinus;
			bestTheta = thetaMinus.slice();
		}

		// SPSA gradient estimate: g_hat[i] = (Lp - Lm) / (2*ck*delta[i]).
		// Since delta[i] ∈ {-1, +1}, 1/delta[i] = delta[i].
		const gradScale = (lossPlus - lossMinus) / (2 * ck);
		for (let i = 0; i < dim; i += 1) {
			const t = theta[i] ?? 0;
			const d = delta[i] ?? 0;
			const lo = options.lowerBounds[i] ?? Number.NEGATIVE_INFINITY;
			const hi = options.upperBounds[i] ?? Number.POSITIVE_INFINITY;
			theta[i] = clip(t - ak * gradScale * d, lo, hi);
		}

		const state: SpsaIterationState = {
			iteration: k,
			theta: theta.slice(),
			lossPlus,
			lossMinus,
			lossEstimate,
			stepSize: ak,
			perturbMagnitude: ck,
		};
		history.push(state);
		options.onIteration?.(state);
	}

	return { theta, bestTheta, bestLoss, history };
}

/**
 * SPSA correctness check using a synthetic loss function — no broker
 * involvement, runs in milliseconds.
 *
 * Tests:
 *   1. Quadratic bowl: loss(x) = ||x||² has its minimum at the origin.
 *      SPSA should converge from any start within bounds.
 *   2. Bounds clipping: weights starting outside the optimum direction
 *      shouldn't escape their box.
 *   3. Determinism: same seed → same trajectory.
 */

import { describe, expect, it } from "vitest";
import { spsa } from "../spsa";

describe("SPSA — synthetic loss", () => {
	it("converges on a quadratic bowl from a non-zero start", () => {
		const dim = 5;
		const lossFn = (theta: ReadonlyArray<number>): number =>
			theta.reduce((sum, x) => sum + x * x, 0);

		const start = [1, -1, 1, -1, 1];
		const result = spsa(start, lossFn, {
			maxIterations: 200,
			a: 0.3,
			c: 0.2,
			A: 10,
			lowerBounds: new Array(dim).fill(-2),
			upperBounds: new Array(dim).fill(2),
			seed: 7,
		});

		// Best loss should be smaller than the starting loss.
		const startLoss = lossFn(start);
		expect(result.bestLoss).toBeLessThan(startLoss);
		// And appreciably so — should reach below 0.5 from a starting
		// loss of 5.0.
		expect(result.bestLoss).toBeLessThan(0.5);
	});

	it("respects per-dim bounds — clipped weights stay in box", () => {
		// Loss function pushes weights toward (10, 10, 10), but bounds
		// clip them at (1, 1, 1).
		const target = [10, 10, 10];
		const lossFn = (theta: ReadonlyArray<number>): number =>
			theta.reduce((s, x, i) => s + (x - (target[i] ?? 0)) ** 2, 0);

		const start = [0, 0, 0];
		const result = spsa(start, lossFn, {
			maxIterations: 100,
			lowerBounds: [0, 0, 0],
			upperBounds: [1, 1, 1],
			seed: 1,
		});

		// Every dim should remain in [0, 1].
		for (const x of result.bestTheta) {
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(1);
		}
	});

	it("is deterministic — same seed reproduces the same trajectory", () => {
		const dim = 4;
		const lossFn = (theta: ReadonlyArray<number>): number =>
			theta.reduce((sum, x) => sum + (x - 0.5) ** 2, 0);

		const start = [0, 0, 0, 0];
		const opts = {
			maxIterations: 30,
			lowerBounds: new Array(dim).fill(-2),
			upperBounds: new Array(dim).fill(2),
			seed: 42,
		};

		const r1 = spsa(start, lossFn, opts);
		const r2 = spsa(start, lossFn, opts);

		expect(r1.bestLoss).toBe(r2.bestLoss);
		for (let i = 0; i < dim; i += 1) {
			expect(r1.bestTheta[i]).toBe(r2.bestTheta[i]);
		}
	});
});

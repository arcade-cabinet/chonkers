/**
 * Tuner-internal mini-match runner — bypasses the broker so we can
 * pass synthetic `Profile` objects with custom weights without
 * mutating the global `PROFILES` table.
 *
 * Pure-TS, replay mode only, no DOM, no persistence side effects.
 * Returns the winner ("red" | "white" | null) and ply count.
 *
 * Two depth modes:
 *   - default (uses profile.knobs.search_depth, which is 2 for easy
 *     tier): faithful evaluation but ~7s/match — too slow for the
 *     SPSA inner loop.
 *   - depthOverride: 1: greedy 1-ply lookahead, ~50-100ms/match. Fast
 *     enough for the 5760-match SPSA loop (~7min) but the absolute
 *     win rates differ from depth=2. The RELATIVE balance between
 *     dispositions is what the tuner optimises, so depth=1 is the
 *     right tier for SPSA evaluation. The tuned weights are then
 *     validated at depth=2 by the beta governor.
 */

import {
	type AiState,
	chooseAction,
	createAiState,
	type Decision,
	type Profile,
} from "@/ai";
import {
	type Color,
	createInitialState,
	applyAction as engineApply,
	type GameState,
} from "@/engine";
import { decideFirstPlayer } from "../../sim/coinFlip";

export interface MatchResult {
	winner: Color | null;
	plies: number;
	outlier: boolean;
}

export interface RunMatchOptions {
	readonly redProfile: Profile;
	readonly whiteProfile: Profile;
	readonly coinFlipSeed: string;
	readonly maxPlies?: number;
	/**
	 * Override the search depth on both profiles for THIS match.
	 * Cheaper depths (1 = greedy) are an order of magnitude faster
	 * but produce different absolute win rates; only relative
	 * balance carries between depths. Use depth=1 for SPSA eval,
	 * full depth for governor validation.
	 */
	readonly depthOverride?: number;
}

function withDepth(p: Profile, depth: number | undefined): Profile {
	if (depth === undefined || depth === p.knobs.search_depth) return p;
	return {
		...p,
		knobs: { ...p.knobs, search_depth: depth },
	};
}

export function runMatch(opts: RunMatchOptions): MatchResult {
	const maxPlies = opts.maxPlies ?? 200;
	const redProfile = withDepth(opts.redProfile, opts.depthOverride);
	const whiteProfile = withDepth(opts.whiteProfile, opts.depthOverride);
	const firstPlayer = decideFirstPlayer(opts.coinFlipSeed);
	let game: GameState = createInitialState(firstPlayer);
	const aiRed: AiState = createAiState(redProfile.key);
	const aiWhite: AiState = createAiState(whiteProfile.key);

	let plies = 0;
	let consecutiveStalls = 0;

	while (plies < maxPlies) {
		if (game.winner) {
			return { winner: game.winner, plies, outlier: false };
		}

		const mover = game.turn;
		const profile = mover === "red" ? redProfile : whiteProfile;
		const ai = mover === "red" ? aiRed : aiWhite;
		const decision: Decision = chooseAction(game, profile, mover, ai, {
			mode: "replay",
		});

		if (decision.kind === "forfeit") {
			return {
				winner: mover === "red" ? "white" : "red",
				plies,
				outlier: false,
			};
		}

		if (decision.kind === "stalled") {
			// Mirror broker's stall behaviour — flip turn + clear chain.
			game = {
				...game,
				turn: mover === "red" ? "white" : "red",
				chain: null,
			};
			consecutiveStalls += 1;
			if (consecutiveStalls >= 10) {
				return { winner: null, plies, outlier: true };
			}
			continue;
		}

		game = engineApply(game, decision.action);
		plies += 1;
		consecutiveStalls = 0;
	}

	// Hit the ply cap without a winner.
	return { winner: game.winner, plies, outlier: game.winner === null };
}

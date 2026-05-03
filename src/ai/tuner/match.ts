/**
 * Tuner-internal mini-match runner — bypasses the broker so we can
 * pass synthetic `Profile` objects with custom weights without
 * mutating the global `PROFILES` table.
 *
 * Pure-TS, replay mode only, no DOM, no persistence side effects.
 * Returns the winner ("red" | "white" | null) and ply count.
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
}

export function runMatch(opts: RunMatchOptions): MatchResult {
	const maxPlies = opts.maxPlies ?? 200;
	const firstPlayer = decideFirstPlayer(opts.coinFlipSeed);
	let game: GameState = createInitialState(firstPlayer);
	const aiRed: AiState = createAiState(opts.redProfile.key);
	const aiWhite: AiState = createAiState(opts.whiteProfile.key);

	let plies = 0;
	let consecutiveStalls = 0;

	while (plies < maxPlies) {
		if (game.winner) {
			return { winner: game.winner, plies, outlier: false };
		}

		const mover = game.turn;
		const profile = mover === "red" ? opts.redProfile : opts.whiteProfile;
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

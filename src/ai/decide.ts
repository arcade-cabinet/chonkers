/**
 * Public AI entry point: `chooseAction(state, profile, mode, ai?)`
 *
 * Returns one of:
 *   - `{ kind: "act", action }` — a chosen Action to apply.
 *   - `{ kind: "forfeit" }`     — the AI gives up (eval below the
 *                                  profile's forfeit threshold and
 *                                  no clearly-better move exists).
 *   - `{ kind: "stalled" }`     — no legal action, no forfeit; the
 *                                  caller (sim broker) decides what
 *                                  this means in context (chain
 *                                  unable to continue → control
 *                                  flips per RULES.md §5.4).
 *
 * The function is contractually deterministic per docs/AI.md:
 *   - Same (state, profile, mode) → same Decision in `replay` mode.
 *   - In `live` mode, output is deterministic for a fixed (state,
 *     profile, hardware) but may vary across hosts because iterative
 *     deepening's depth depends on time budget.
 */

import type { Action, Color, GameState } from "@/engine";
import { evaluate } from "./evaluation";
import type { Profile } from "./profiles";
import { type SearchMode, search } from "./search";
import type { AiState } from "./state";
import { createAiState } from "./state";

export type Decision =
	| { readonly kind: "act"; readonly action: Action; readonly score: number }
	| { readonly kind: "forfeit"; readonly score: number }
	| { readonly kind: "stalled" };

export interface ChooseOptions {
	readonly mode?: SearchMode;
	/** Explicit clock for tests / replays. Defaults to `Date.now`. */
	readonly now?: () => number;
}

export function chooseAction(
	state: GameState,
	profile: Profile,
	player: Color,
	aiState: AiState = createAiState(profile.key),
	options: ChooseOptions = {},
): Decision {
	const mode: SearchMode = options.mode ?? "live";
	const now = options.now ?? Date.now;

	const result = search(state, profile, player, mode, aiState, now);

	if (result.action == null) {
		// No legal action found. If the player is sitting on a hopeless
		// position the caller can wrap this in a forfeit; otherwise
		// "stalled" is the right answer (chain dead-ends, etc.).
		const score = evaluate(state, profile, player);
		if (score <= profile.forfeit.threshold) {
			return { kind: "forfeit", score };
		}
		return { kind: "stalled" };
	}

	// Forfeit consideration: if the best score the search could find is
	// below the forfeit threshold AND the threshold is below "definitely
	// losing", the AI gives up. This avoids forfeit triggering on
	// recoverable positions.
	if (result.score <= profile.forfeit.threshold) {
		return { kind: "forfeit", score: result.score };
	}

	return { kind: "act", action: result.action, score: result.score };
}

/**
 * AI profile catalogue per docs/AI.md.
 *
 * Nine profiles spanning 3 dispositions × 3 difficulties. Disposition
 * shapes the feature-weight ratios; difficulty shapes search depth +
 * prune aggressiveness + time budget + forfeit threshold.
 *
 * The numeric values here are the **alpha-stage initial weights** —
 * theoretical first-cut, reasoned from chonkers' rule mechanics. The
 * 100-run alpha broker pass, 1000-run beta governor pass, and 10000-
 * run rc governor pass each tune these values from balance data; see
 * docs/AI.md "Tuning history" for the audit trail.
 *
 * Adding a new profile (e.g. `nemesis-impossible`) is a code commit
 * here; the profile key just becomes a new entry in PROFILES. No
 * schema migration required.
 */

export type Disposition = "aggressive" | "balanced" | "defensive";
export type Difficulty = "easy" | "medium" | "hard";

export type ProfileKey =
	| "aggressive-easy"
	| "aggressive-medium"
	| "aggressive-hard"
	| "balanced-easy"
	| "balanced-medium"
	| "balanced-hard"
	| "defensive-easy"
	| "defensive-medium"
	| "defensive-hard";

export const ALL_PROFILE_KEYS: ReadonlyArray<ProfileKey> = [
	"aggressive-easy",
	"aggressive-medium",
	"aggressive-hard",
	"balanced-easy",
	"balanced-medium",
	"balanced-hard",
	"defensive-easy",
	"defensive-medium",
	"defensive-hard",
];

/**
 * Feature weights — the ratios that define a disposition.
 * See docs/AI.md "Feature vector" for the meanings.
 */
export interface FeatureWeights {
	readonly forward_progress: number;
	readonly top_count: number;
	readonly home_row_tops: number;
	readonly chonk_opportunities: number;
	readonly tall_stack_count: number;
	readonly blocker_count: number;
	readonly chain_owed: number;
	readonly opponent_forward_progress: number;
	readonly opponent_home_row_tops: number;
	readonly opponent_tall_stacks_unblocked: number;
}

const AGGRESSIVE_WEIGHTS: FeatureWeights = {
	forward_progress: +3.0,
	top_count: +2.0,
	home_row_tops: +20.0,
	chonk_opportunities: +1.5,
	tall_stack_count: +2.5,
	blocker_count: +0.5,
	chain_owed: -2.0,
	opponent_forward_progress: -1.5,
	opponent_home_row_tops: -25.0,
	opponent_tall_stacks_unblocked: -1.0,
};

const BALANCED_WEIGHTS: FeatureWeights = {
	forward_progress: +2.0,
	top_count: +2.0,
	home_row_tops: +20.0,
	chonk_opportunities: +0.8,
	tall_stack_count: +1.5,
	blocker_count: +1.5,
	chain_owed: -2.0,
	opponent_forward_progress: -2.0,
	opponent_home_row_tops: -25.0,
	opponent_tall_stacks_unblocked: -2.0,
};

const DEFENSIVE_WEIGHTS: FeatureWeights = {
	forward_progress: +1.5,
	top_count: +2.5,
	home_row_tops: +20.0,
	chonk_opportunities: +0.3,
	tall_stack_count: +0.8,
	blocker_count: +3.0,
	chain_owed: -2.0,
	opponent_forward_progress: -3.0,
	opponent_home_row_tops: -25.0,
	opponent_tall_stacks_unblocked: -3.5,
};

/**
 * Difficulty knobs. `search_depth` is the alpha-beta horizon in
 * plies; `prune_aggression` is the fraction of expected branches the
 * search may discard at each layer; `time_budget_ms` is the soft cap
 * for live mode (replay mode pins to `search_depth` and ignores it).
 */
export interface DifficultyKnobs {
	readonly search_depth: number;
	readonly prune_aggression: number;
	readonly time_budget_ms: number;
}

const EASY_KNOBS: DifficultyKnobs = {
	search_depth: 2,
	prune_aggression: 0.4,
	time_budget_ms: 200,
};

const MEDIUM_KNOBS: DifficultyKnobs = {
	search_depth: 4,
	prune_aggression: 0.2,
	time_budget_ms: 800,
};

const HARD_KNOBS: DifficultyKnobs = {
	search_depth: 6,
	prune_aggression: 0.05,
	time_budget_ms: 3000,
};

/** Eval threshold below which the AI considers `forfeit`. */
export interface ForfeitPolicy {
	readonly threshold: number;
}

const AGGRESSIVE_FORFEIT: ForfeitPolicy = { threshold: -200.0 };
const BALANCED_FORFEIT: ForfeitPolicy = { threshold: -120.0 };
const DEFENSIVE_FORFEIT: ForfeitPolicy = { threshold: -80.0 };

export interface Profile {
	readonly key: ProfileKey;
	readonly disposition: Disposition;
	readonly difficulty: Difficulty;
	readonly weights: FeatureWeights;
	readonly knobs: DifficultyKnobs;
	readonly forfeit: ForfeitPolicy;
}

function makeProfile(
	key: ProfileKey,
	disposition: Disposition,
	difficulty: Difficulty,
	weights: FeatureWeights,
	knobs: DifficultyKnobs,
	forfeit: ForfeitPolicy,
): Profile {
	return { key, disposition, difficulty, weights, knobs, forfeit };
}

export const PROFILES: Readonly<Record<ProfileKey, Profile>> = {
	"aggressive-easy": makeProfile(
		"aggressive-easy",
		"aggressive",
		"easy",
		AGGRESSIVE_WEIGHTS,
		EASY_KNOBS,
		AGGRESSIVE_FORFEIT,
	),
	"aggressive-medium": makeProfile(
		"aggressive-medium",
		"aggressive",
		"medium",
		AGGRESSIVE_WEIGHTS,
		MEDIUM_KNOBS,
		AGGRESSIVE_FORFEIT,
	),
	"aggressive-hard": makeProfile(
		"aggressive-hard",
		"aggressive",
		"hard",
		AGGRESSIVE_WEIGHTS,
		HARD_KNOBS,
		AGGRESSIVE_FORFEIT,
	),
	"balanced-easy": makeProfile(
		"balanced-easy",
		"balanced",
		"easy",
		BALANCED_WEIGHTS,
		EASY_KNOBS,
		BALANCED_FORFEIT,
	),
	"balanced-medium": makeProfile(
		"balanced-medium",
		"balanced",
		"medium",
		BALANCED_WEIGHTS,
		MEDIUM_KNOBS,
		BALANCED_FORFEIT,
	),
	"balanced-hard": makeProfile(
		"balanced-hard",
		"balanced",
		"hard",
		BALANCED_WEIGHTS,
		HARD_KNOBS,
		BALANCED_FORFEIT,
	),
	"defensive-easy": makeProfile(
		"defensive-easy",
		"defensive",
		"easy",
		DEFENSIVE_WEIGHTS,
		EASY_KNOBS,
		DEFENSIVE_FORFEIT,
	),
	"defensive-medium": makeProfile(
		"defensive-medium",
		"defensive",
		"medium",
		DEFENSIVE_WEIGHTS,
		MEDIUM_KNOBS,
		DEFENSIVE_FORFEIT,
	),
	"defensive-hard": makeProfile(
		"defensive-hard",
		"defensive",
		"hard",
		DEFENSIVE_WEIGHTS,
		HARD_KNOBS,
		DEFENSIVE_FORFEIT,
	),
};

/** Look up a profile by key, throwing if the key is unknown. */
export function getProfile(key: ProfileKey): Profile {
	const p = PROFILES[key];
	if (!p) throw new Error(`getProfile: unknown profile key '${key}'`);
	return p;
}

/** Type guard for profile keys; useful for validating store inputs. */
export function isProfileKey(key: string): key is ProfileKey {
	return Object.hasOwn(PROFILES, key);
}

// Module-load drift guard: if `ALL_PROFILE_KEYS` ever drifts from the
// keys actually present in `PROFILES` (say, someone adds a profile
// but forgets to update the list, or vice-versa), fail at first
// import rather than letting AI selection silently miss profiles.
{
	const profileKeys = Object.keys(PROFILES).sort();
	const listKeys = [...ALL_PROFILE_KEYS].sort();
	if (
		profileKeys.length !== listKeys.length ||
		profileKeys.some((k, i) => k !== listKeys[i])
	) {
		throw new Error(
			`profiles.ts: ALL_PROFILE_KEYS drift — list has [${listKeys.join(", ")}], PROFILES has [${profileKeys.join(", ")}]`,
		);
	}
}

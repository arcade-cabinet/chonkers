/**
 * src/ai — chonkers' AI opponent.
 *
 * Pure TypeScript. Deterministic per docs/AI.md. No PRNG. The single
 * entropy source for the broader game (the per-match `coin_flip_seed`)
 * lives in src/sim/, not here.
 *
 * Public API:
 *   chooseAction(state, profile, player, ai?, options?)
 *   dumpAiState(ai) / loadAiState(blob)
 *   PROFILES, getProfile(key), isProfileKey(key)
 */

export { type ChooseOptions, chooseAction, type Decision } from "./decide";
export {
	AiDumpError,
	CURRENT_DUMP_FORMAT_VERSION,
	dumpAiState,
	loadAiState,
} from "./dump";
export { evaluate, TERMINAL_WIN_SCORE } from "./evaluation";
export { computeFeatures, type FeatureValues } from "./features";
export {
	ALL_PROFILE_KEYS,
	type Difficulty,
	type DifficultyKnobs,
	type Disposition,
	type FeatureWeights,
	type ForfeitPolicy,
	getProfile,
	isProfileKey,
	PROFILES,
	type Profile,
	type ProfileKey,
} from "./profiles";
export {
	type SearchMode,
	type SearchResult,
	search,
	TT_MAX_ENTRIES,
} from "./search";
export {
	type AiState,
	createAiState,
	type TranspositionEntry,
	type TranspositionTable,
} from "./state";

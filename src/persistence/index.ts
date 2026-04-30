/**
 * src/persistence — chonkers' durable storage layer.
 *
 * One child package: `preferences/` — typed JSON kv over
 * @capacitor/preferences (localStorage on web, UserDefaults on iOS,
 * SharedPreferences on Android).
 *
 * Two slot kinds:
 *   • Settings       — `kv['settings']` namespace (volume, mute,
 *                       reduced-motion, default-difficulty, etc.).
 *   • Active match   — `kv['match']['active']`, the in-progress match
 *                       snapshot. See `./preferences/match.ts`.
 *
 * Historical match records have no in-app value (no replay UI, no
 * achievements, no progression). They're a balance-testing concern
 * generated/consumed inside governor specs via filesystem artifacts,
 * not via Preferences.
 *
 * See docs/PERSISTENCE.md for the full contract.
 */

export {
	type ActiveMatchSnapshot,
	clearActiveMatch,
	kv,
	loadActiveMatch,
	restoreAiPair,
	saveActiveMatch,
	snapshotFromHandle,
} from "./preferences";

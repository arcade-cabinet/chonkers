/**
 * src/persistence/preferences — typed JSON key-value over @capacitor/preferences.
 *
 * Capacitor handles platform routing: localStorage on web, UserDefaults
 * on iOS, SharedPreferences on Android. This package adds typed JSON
 * serialization + namespace::key encoding on top.
 *
 * See docs/PERSISTENCE.md for the full contract.
 */

export { kv } from "./kv";
export {
	type ActiveMatchSnapshot,
	clearActiveMatch,
	loadActiveMatch,
	restoreAiPair,
	saveActiveMatch,
	snapshotFromHandle,
} from "./match";

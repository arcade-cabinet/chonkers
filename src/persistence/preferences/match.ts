/**
 * Active-match persistence over Capacitor Preferences.
 *
 * At most one active match at a time, stored at `kv['match', 'active']`.
 * The snapshot carries everything needed to fully resume play —
 * including the AI's serialized brain — so a relaunch lands the
 * player exactly where they left off and the AI plays the same way
 * it would have.
 *
 * No history namespace exists at runtime (see PRQ-T-persist:
 * historical match records have no in-app value, so they're a
 * balance-testing concern handled inside governor specs via
 * filesystem artifacts, not via Preferences).
 *
 * No migration logic — yuka and the engine state shape are both
 * frozen ropes. If a future change breaks the shape, JSON.parse
 * throws on resume, `loadActiveMatch` returns null, and the player
 * starts a fresh match. Backwards compat is "newer reads of older
 * shapes might fail," which is acceptable for a casual game.
 */

import {
	CURRENT_DUMP_FORMAT_VERSION,
	dumpAiState,
	loadAiState,
	type ProfileKey,
} from "@/ai";
import type { Action } from "@/engine";
import type { MatchHandle } from "@/sim/broker";
import type { HumanColor } from "@/sim/traits";
import { kv } from "./kv";

const NAMESPACE = "match";
const ACTIVE_KEY = "active";

export interface ActiveMatchSnapshot {
	readonly matchId: string;
	readonly redProfile: ProfileKey;
	readonly whiteProfile: ProfileKey;
	readonly humanColor: HumanColor;
	readonly coinFlipSeed: string;
	readonly actions: ReadonlyArray<Action>;
	/** Base64 of `dumpAiState(handle.ai.red)`. */
	readonly redAiDumpB64: string;
	/** Base64 of `dumpAiState(handle.ai.white)`. */
	readonly whiteAiDumpB64: string;
	readonly aiDumpFormatVersion: number;
	readonly startedAt: number;
	readonly lastSavedAt: number;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1)
		binary += String.fromCharCode(bytes[i] as number);
	if (typeof btoa === "function") return btoa(binary);
	// Node fallback (test environment).
	return Buffer.from(binary, "binary").toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
	let binary: string;
	if (typeof atob === "function") {
		binary = atob(b64);
	} else {
		binary = Buffer.from(b64, "base64").toString("binary");
	}
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1)
		out[i] = binary.charCodeAt(i) & 0xff;
	return out;
}

/**
 * Build a snapshot from a live MatchHandle. `humanColor` is supplied
 * by the caller — the broker doesn't know which side is the human
 * (the trait layer does).
 */
export function snapshotFromHandle(
	handle: MatchHandle,
	humanColor: HumanColor,
	startedAt: number,
): ActiveMatchSnapshot {
	return {
		matchId: handle.matchId,
		redProfile: handle.redProfile,
		whiteProfile: handle.whiteProfile,
		humanColor,
		coinFlipSeed: handle.coinFlipSeed,
		actions: [...handle.actions],
		redAiDumpB64: bytesToBase64(dumpAiState(handle.ai.red)),
		whiteAiDumpB64: bytesToBase64(dumpAiState(handle.ai.white)),
		aiDumpFormatVersion: CURRENT_DUMP_FORMAT_VERSION,
		startedAt,
		lastSavedAt: Date.now(),
	};
}

/** Write the active-match snapshot. Overwrites any prior. */
export async function saveActiveMatch(
	snapshot: ActiveMatchSnapshot,
): Promise<void> {
	await kv.put(NAMESPACE, ACTIVE_KEY, snapshot);
}

/** Read the active-match snapshot, or null if none. */
export async function loadActiveMatch(): Promise<ActiveMatchSnapshot | null> {
	return kv.get<ActiveMatchSnapshot>(NAMESPACE, ACTIVE_KEY);
}

/** Remove the active-match slot — typically called on match-end transition. */
export async function clearActiveMatch(): Promise<void> {
	await kv.remove(NAMESPACE, ACTIVE_KEY);
}

/**
 * Restore an `AiState` pair from the snapshot's base64-encoded
 * dumps. Throws `AiDumpError` if either blob is corrupt or the
 * format version is unsupported.
 */
export function restoreAiPair(snapshot: ActiveMatchSnapshot): {
	red: ReturnType<typeof loadAiState>;
	white: ReturnType<typeof loadAiState>;
} {
	return {
		red: loadAiState(base64ToBytes(snapshot.redAiDumpB64)),
		white: loadAiState(base64ToBytes(snapshot.whiteAiDumpB64)),
	};
}

/**
 * Typed JSON key-value store over @capacitor/preferences.
 *
 * Capacitor handles platform routing: localStorage on web,
 * UserDefaults on iOS, SharedPreferences on Android. This wrapper
 * adds typed JSON serialization and namespace::key encoding.
 *
 * Corrupted JSON (legacy or external writer) returns null rather
 * than throwing. Concurrent puts to different keys do not interfere
 * (Capacitor Preferences serializes per-key writes platform-side).
 */

import { Preferences } from "@capacitor/preferences";

const SEPARATOR = "::";

function encodeKey(namespace: string, key: string): string {
	return `${namespace}${SEPARATOR}${key}`;
}

function decodeKey(encoded: string): { namespace: string; key: string } | null {
	const idx = encoded.indexOf(SEPARATOR);
	if (idx < 0) return null;
	return {
		namespace: encoded.slice(0, idx),
		key: encoded.slice(idx + SEPARATOR.length),
	};
}

function safeParse<T>(raw: string): T | null {
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export const kv = {
	async get<T>(namespace: string, key: string): Promise<T | null> {
		const { value } = await Preferences.get({ key: encodeKey(namespace, key) });
		if (value == null) return null;
		return safeParse<T>(value);
	},

	async put<T>(namespace: string, key: string, value: T): Promise<void> {
		await Preferences.set({
			key: encodeKey(namespace, key),
			value: JSON.stringify(value),
		});
	},

	async remove(namespace: string, key: string): Promise<void> {
		await Preferences.remove({ key: encodeKey(namespace, key) });
	},

	async list<T>(namespace: string): Promise<Array<{ key: string; value: T }>> {
		const { keys } = await Preferences.keys();
		const prefix = `${namespace}${SEPARATOR}`;
		const matched = keys.filter((k) => k.startsWith(prefix));
		const results: Array<{ key: string; value: T }> = [];
		await Promise.all(
			matched.map(async (encoded) => {
				const { value } = await Preferences.get({ key: encoded });
				if (value == null) return;
				const parsed = safeParse<T>(value);
				if (parsed == null) return;
				const decoded = decodeKey(encoded);
				if (decoded == null) return;
				results.push({ key: decoded.key, value: parsed });
			}),
		);
		return results;
	},

	async clear(namespace?: string): Promise<void> {
		if (namespace == null) {
			await Preferences.clear();
			return;
		}
		const { keys } = await Preferences.keys();
		const prefix = `${namespace}${SEPARATOR}`;
		await Promise.all(
			keys
				.filter((k) => k.startsWith(prefix))
				.map((k) => Preferences.remove({ key: k })),
		);
	},
} as const;

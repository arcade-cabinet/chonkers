/**
 * One-time jeep-sqlite custom-element registration on web.
 *
 * jeep-sqlite is the web fallback for @capacitor-community/sqlite —
 * it provides SQLite via sql.js + Web Workers + OPFS persistence.
 * The plugin requires its custom element to be registered in the
 * DOM before SQLite operations can be performed.
 *
 * Native platforms (iOS/Android) ignore this entirely; Capacitor
 * SQLite uses the platform-native SQLite implementation.
 */

import { Capacitor } from "@capacitor/core";
import { defineCustomElements as defineJeepSqlite } from "jeep-sqlite/loader";

let registered = false;
let registrationPromise: Promise<void> | null = null;

/**
 * Register the jeep-sqlite custom element. Idempotent across calls
 * within the same process: the first call performs the registration,
 * subsequent calls return the same resolved promise.
 *
 * On native platforms, resolves immediately with no work.
 */
export function registerJeepSqlite(): Promise<void> {
	if (registered) return Promise.resolve();
	if (registrationPromise) return registrationPromise;

	registrationPromise = (async () => {
		if (Capacitor.getPlatform() !== "web") {
			registered = true;
			return;
		}

		defineJeepSqlite(window);
		await customElements.whenDefined("jeep-sqlite");

		if (!document.querySelector("jeep-sqlite")) {
			const el = document.createElement("jeep-sqlite");
			el.setAttribute("autosave", "true");
			document.body.appendChild(el);
		}

		registered = true;
	})();

	return registrationPromise;
}

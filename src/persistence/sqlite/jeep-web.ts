/**
 * One-time jeep-sqlite custom-element registration on web.
 *
 * jeep-sqlite is the web fallback for `@capacitor-community/sqlite` —
 * it provides SQLite via sql.js + a Web Component + OPFS persistence.
 * The plugin requires its custom element to be registered in the DOM
 * before SQLite operations can be performed.
 *
 * `wasmpath` points the element at the URL where `sql-wasm.wasm` is
 * served. Vite serves `public/` from the site root, and the
 * `copywasm` script (runs as `predev` / `prebuild` / `pretest:browser`)
 * places `sql-wasm.wasm` at `public/assets/`. The `BASE_URL` env var
 * carries Vite's base path so the URL works under non-root deployments
 * (Capacitor `file://` included).
 *
 * `autosave` is intentionally NOT set on the custom element. autosave
 * opens an implicit jeep-managed transaction that collides with
 * explicit BEGIN/COMMIT calls (drizzle's transaction support uses
 * explicit transactions). We persist OPFS state explicitly via
 * `sqlite.saveToStore(name)` from the runtime client after writes.
 *
 * Native platforms (iOS/Android) ignore this entirely; capacitor-sqlite
 * uses the platform-native SQLite implementation.
 *
 * On registration failure, the cached promise is cleared so callers
 * can retry — a transient WASM fetch error must not poison the
 * runtime for the rest of the session.
 */

import { Capacitor } from "@capacitor/core";
import { defineCustomElements as defineJeepSqlite } from "jeep-sqlite/loader";

let registered = false;
let registrationPromise: Promise<void> | null = null;

function resolveWasmPath(): string {
	const base = import.meta.env.BASE_URL ?? "/";
	const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
	return `${trimmed}/assets`;
}

/**
 * Register the jeep-sqlite custom element. Idempotent across calls
 * within the same process: the first call performs the registration,
 * subsequent calls return the same resolved promise. On failure, the
 * cached promise is cleared so callers can retry.
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
			el.setAttribute("wasmpath", resolveWasmPath());
			document.body.appendChild(el);
		}

		registered = true;
	})().catch((err) => {
		registrationPromise = null;
		throw err;
	});

	return registrationPromise;
}

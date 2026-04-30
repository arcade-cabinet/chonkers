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
 * Patch `XMLHttpRequest.open` so jeep-sqlite's hardcoded
 * `/assets/databases/...` requests resolve under non-root deployments
 * (GitHub Pages project sites under `/chonkers/`).
 *
 * jeep-sqlite's `_copyFromAssets` + `copyDatabase` paths construct
 * URLs as `/assets/databases/databases.json` and
 * `/assets/databases/<name>.db` and request them via XMLHttpRequest.
 * The `wasmpath` attribute does NOT affect this — it only routes
 * the WASM fetch. Vite's `base: '/chonkers/'` puts the actual
 * files at `/chonkers/assets/databases/...`, so without rewriting,
 * every Pages deployment 404s on first boot.
 *
 * The rewrite is scoped to absolute `/assets/` paths only and
 * only when BASE_URL !== "/" — root-deployed and Capacitor
 * (file://) builds are untouched.
 */
function installAssetsPathShim(): void {
	const base = import.meta.env.BASE_URL ?? "/";
	if (base === "/" || base === "./") return;
	const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
	const open = XMLHttpRequest.prototype.open;
	const REWRITE_RE = /^\/assets\//;
	// biome-ignore lint/suspicious/noExplicitAny: XHR's overloads have
	// many positional shapes; we forward `arguments` verbatim.
	XMLHttpRequest.prototype.open = function patchedOpen(
		this: XMLHttpRequest,
		method: string,
		url: string | URL,
		// biome-ignore lint/suspicious/noExplicitAny: see above
		...rest: any[]
	) {
		if (typeof url === "string" && REWRITE_RE.test(url)) {
			const rewritten = `${prefix}${url}`;
			// biome-ignore lint/suspicious/noExplicitAny: see above
			return (open as any).call(this, method, rewritten, ...rest);
		}
		// biome-ignore lint/suspicious/noExplicitAny: see above
		return (open as any).call(this, method, url, ...rest);
	} as typeof XMLHttpRequest.prototype.open;
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

		// MUST run before jeep-sqlite's first `_copyFromAssets` call
		// — that fires inside `defineJeepSqlite` → custom-element
		// `componentWillLoad` → `loadJSON` (XHR). Installing the
		// shim earlier than that is the difference between a
		// working Pages deploy and a 404 cascade.
		installAssetsPathShim();

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

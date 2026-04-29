/**
 * Version detection + migration-replay window calculation.
 *
 * The build-time pipeline (`scripts/build-game-db.mjs`) sets
 * `PRAGMA user_version = N` on the shipped `public/game.db` and
 * writes a sibling `public/game-db.meta.json` containing
 * `{ user_version: N, generated_at: "..." }`. The runtime reads the
 * meta file (cheap — JSON parse, no SQLite) instead of opening the
 * shipped DB just to read its version.
 *
 * On user runtime, `bootstrap.ts` reads the user's persisted DB's
 * `PRAGMA user_version` (`persisted_version`) and compares against
 * the served meta's `user_version` (`served_version`). The replay
 * window is migrations `(persisted_version, served_version]` — i.e.
 * indices `persisted_version` through `served_version - 1` in the
 * sorted `drizzle/NNNN_*.sql` list (since user_version equals the
 * count of applied migrations, indices are 0-based).
 *
 * See `docs/DB.md` "Versioning" + "User runtime".
 */

export interface ServedDbMeta {
	readonly user_version: number;
	readonly generated_at: string;
}

/**
 * Replay decision returned by {@link computeReplay}. Each variant is
 * actionable in `bootstrap.ts` without further branching.
 */
export type ReplayDecision =
	| { readonly kind: "import-fresh"; readonly servedVersion: number }
	| { readonly kind: "no-op"; readonly version: number }
	| {
			readonly kind: "replay-forward";
			readonly persistedVersion: number;
			readonly servedVersion: number;
			/** Inclusive 0-based migration indices to replay, in order. */
			readonly migrationIndices: readonly number[];
	  }
	| {
			readonly kind: "refuse-downgrade";
			readonly persistedVersion: number;
			readonly servedVersion: number;
	  };

/**
 * Decide what bootstrap should do given the persisted user DB's
 * version (or null = no DB yet) and the served `game.db`'s version.
 *
 * - `null` persisted → import the asset fresh.
 * - `persisted == served` → no-op.
 * - `persisted < served` → replay missing migrations forward.
 * - `persisted > served` → refuse: user DB is newer than the bundle.
 */
export function computeReplay(
	persistedVersion: number | null,
	servedVersion: number,
): ReplayDecision {
	if (persistedVersion == null) {
		return { kind: "import-fresh", servedVersion };
	}
	if (persistedVersion === servedVersion) {
		return { kind: "no-op", version: persistedVersion };
	}
	if (persistedVersion < servedVersion) {
		const indices: number[] = [];
		for (let i = persistedVersion; i < servedVersion; i += 1) {
			indices.push(i);
		}
		return {
			kind: "replay-forward",
			persistedVersion,
			servedVersion,
			migrationIndices: indices,
		};
	}
	return {
		kind: "refuse-downgrade",
		persistedVersion,
		servedVersion,
	};
}

/**
 * Resolve `/game-db.meta.json` against Vite's `BASE_URL` so the fetch
 * works under non-root deployments (Capacitor `file://` included). The
 * jeep-web custom-element registration uses the same trick for its
 * `wasmpath`; both sites must agree on the served path prefix.
 */
function resolveMetaUrl(): string {
	const base = import.meta.env.BASE_URL ?? "/";
	const trimmed = base.endsWith("/") ? base : `${base}/`;
	return `${trimmed}game-db.meta.json`;
}

/**
 * Fetch the served `public/game-db.meta.json` and parse its version.
 * Throws if the meta file is missing or malformed — bootstrap treats
 * that as a developer error, not a runtime recoverable. `user_version`
 * must be a non-negative integer (it indexes into the migration ladder);
 * NaN, fractional, and negative values are rejected here so a malformed
 * meta file can never produce an impossible replay window in
 * `computeReplay`.
 */
export async function fetchServedMeta(
	url = resolveMetaUrl(),
): Promise<ServedDbMeta> {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) {
		throw new Error(
			`fetchServedMeta: HTTP ${res.status} fetching ${url} — is scripts/build-game-db.mjs wired?`,
		);
	}
	const body = (await res.json()) as Partial<ServedDbMeta>;
	if (
		!Number.isInteger(body.user_version) ||
		(body.user_version as number) < 0
	) {
		throw new Error(
			`fetchServedMeta: ${url} has invalid 'user_version' (expected non-negative integer, got ${JSON.stringify(body)})`,
		);
	}
	if (typeof body.generated_at !== "string") {
		throw new Error(
			`fetchServedMeta: ${url} missing required field 'generated_at' (got ${JSON.stringify(body)})`,
		);
	}
	return {
		user_version: body.user_version as number,
		generated_at: body.generated_at,
	};
}

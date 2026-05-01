---
title: Persistence
updated: 2026-04-30
status: current
domain: technical
---

# Persistence

`src/persistence/` is the **typed JSON key-value store** over `@capacitor/preferences`. Capacitor handles platform routing: `localStorage` on web, `UserDefaults` on iOS, `SharedPreferences` on Android.

There is **no SQLite** and no relational database. Match history has no in-app value (no replay UI, no achievements, no progression in the game), so it doesn't need persistent runtime storage. Balance testing in governor specs writes per-match artifacts to `artifacts/governor-runs/<run-id>/<match-id>.json` on the local filesystem, not Preferences.

## Two slot kinds

| Slot | Key | Purpose |
|---|---|---|
| **Settings** | `kv['settings'][<key>]` | Small, frequently-read user preferences. |
| **Active match** | `kv['match']['active']` | At most ONE in-progress match snapshot. Carries everything needed to resume mid-turn including the AI's `dumpAiState` blob (base64-encoded). Cleared on match-end. |

The active-match snapshot shape is `ActiveMatchSnapshot` in `src/persistence/preferences/match.ts`.

## No migrations

Yuka and the engine state shape are both frozen ropes. The AI's dump format is versioned (currently v1, has not changed since the AI shipped). If the format ever changes, `loadAiState` throws on resume, the active-match slot is treated as corrupt, and the player starts a fresh match. Backwards compatibility is "newer reads of older shapes might fail," which is acceptable for a casual game.

This is a deliberate simplification: no `drizzle-kit` migrations, no schema versioning, no `replay-forward` flow, no `bootstrap` import-from-asset path. The store is "JSON in, JSON out."

## API

### Settings

```ts
import { kv } from "@/persistence";

// Get a JSON-serializable value by namespace + key.
// Returns null if the key is missing or the stored value is corrupted JSON.
await kv.get<T>(namespace: string, key: string): Promise<T | null>;

// Put a JSON-serializable value.
await kv.put<T>(namespace: string, key: string, value: T): Promise<void>;

// Remove a key. No-op if missing.
await kv.remove(namespace: string, key: string): Promise<void>;

// List every key+value in a namespace. Skips entries whose JSON is corrupted.
await kv.list<T>(namespace: string): Promise<Array<{ key: string; value: T }>>;

// Clear every key in a namespace, OR every key the package owns when no namespace given.
await kv.clear(namespace?: string): Promise<void>;
```

### Active match

```ts
import {
  type ActiveMatchSnapshot,
  saveActiveMatch,
  loadActiveMatch,
  clearActiveMatch,
  snapshotFromHandle,
  restoreAiPair,
} from "@/persistence";

// On every successful ply commit (wired via SimWorld.onPlyCommit):
const snapshot = snapshotFromHandle(handle, humanColor, startedAt);
await saveActiveMatch(snapshot);

// On boot:
const saved = await loadActiveMatch();
if (saved) {
  // Rebuild handle.game by replaying actions from
  //   createInitialState(decideFirstPlayer(saved.coinFlipSeed))
  // then restore yuka brains via restoreAiPair(saved).
}

// On match end (SimWorld.onMatchEnd):
await clearActiveMatch();
```

## Resume flow

The active match is fully reconstructible from:
1. `coinFlipSeed` → `decideFirstPlayer(seed)` → `createInitialState(firstPlayer)` initial board.
2. `actions[]` → fold `applyAction` over the action log to reconstruct the current `GameState`.
3. `redAiDumpB64` + `whiteAiDumpB64` → `restoreAiPair(snapshot)` to restore the yuka brains.

The deterministic engine + deterministic AI mean replay produces a byte-identical position to where the player paused. Yuka's transposition table is rebuilt on demand (the dump blob carries `chainPlannedRemainder` + `profileKey` only — see `src/ai/dump.ts`).

## Settings keys (current)

| Key | Type | Default |
|---|---|---|
| `volume` | `number` (0..1) | `0.7` |
| `muted` | `boolean` | `false` |
| `reducedMotion` | `boolean` | `false` (overrides `prefers-reduced-motion`) |
| `haptics` | `boolean` | `true` |
| `defaultDifficulty` | `'easy' \| 'medium' \| 'hard'` | `'medium'` |
| `defaultDisposition` | `'aggressive' \| 'balanced' \| 'defensive'` | `'balanced'` |

## Encoding

Keys are stored under Capacitor Preferences as `${namespace}${SEPARATOR}${key}` where `SEPARATOR = "::"`. The `::` separator prevents cross-namespace collisions. Values are JSON-serialised; corrupted JSON returns `null` rather than throwing.

`kv.clear()` without a namespace iterates `Preferences.keys()` and removes only entries containing the `::` separator. Foreign keys (those written by other Capacitor modules or unrelated packages sharing the platform's preferences store) are preserved.

## Platform routing

Capacitor Preferences IS the platform router:

- **Web** → `localStorage`
- **iOS** → `UserDefaults`
- **Android** → `SharedPreferences`

The `kv` wrapper adds typed JSON serialization + the namespace encoding — about 90 lines total. There is no platform-specific code in this layer.

## Concurrency

Capacitor Preferences serialises per-key writes platform-side, so concurrent `put` calls to different keys do not interfere. Concurrent `put` calls to the *same* key are last-writer-wins; this is fine for the use cases (settings written from a single UI thread, active-match snapshot written from a single rAF loop).

## Tests

Tests live at `src/persistence/preferences/__tests__/*.browser.test.ts` and run in the browser tier (`pnpm test:browser`) under real Capacitor Preferences via the `@capacitor/preferences` web implementation. Coverage includes round-trip property tests over arbitrary JSON values, namespace isolation, corrupted-JSON null fallback, concurrent-put safety, and clear-by-namespace boundaries. The active-match snapshot tests construct a handle, save, load, and assert the round trip is faithful including the AI brain restoration.

There is no node-tier test suite for `kv` — Capacitor Preferences requires a browser environment to exercise the web path. The behaviour under iOS/Android is the platform's responsibility (Capacitor's own tests).

## What `src/persistence/` does NOT provide

- Relational queries — out of scope; the game has no shape that benefits from JOIN/GROUP BY at runtime.
- Migration versioning — out of scope; yuka + engine shapes are frozen.
- Encrypted storage — out of scope; Capacitor Preferences is plain text on every platform.
- Match history / governor outliers — those are written to filesystem artifacts inside test/governor specs, not into Preferences. See `e2e/governor.spec.ts` (planned PRQ-T9).

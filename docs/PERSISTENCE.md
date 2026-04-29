---
title: Persistence
updated: 2026-04-29
status: current
domain: technical
---

# Persistence

`src/persistence/` is the **typed JSON key-value store** over `@capacitor/preferences`. It carries small, frequently-read settings — volume, mute, reduced-motion override, last camera angle, last-used AI profile pair, tutorial-seen flag, etc. — that don't belong in the relational database.

Match history, AI dumps, move logs, and analytics aggregates all live in `src/persistence/sqlite/` (drizzle ORM + `@capacitor-community/sqlite`). See `docs/DB.md`.

## Scope boundary

| Belongs in `kv` | Belongs in `db` |
|---|---|
| audio volume, mute flag | match metadata, results |
| last selected camera angle | move history per match |
| AI profile pair last used | AI dump_blob snapshots |
| `prefers-reduced-motion` user override | analytics aggregates |
| `tutorial_seen` flag | opening positions, position hashes |
| current language (when localised) | per-match-singleton state (chain, in-progress flag) |

If the data shape is **a small JSON value addressed by a known key**, it goes in `kv`. If the data shape is **rows queryable by relational predicate (WHERE / JOIN / GROUP BY)**, it goes in `db`.

## API

```ts
import { kv } from '@/persistence';

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
// "Owned" means stored under the chonkers `namespace::key` encoding —
// Capacitor Preferences keys written by other modules are never touched.
await kv.clear(namespace?: string): Promise<void>;
```

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

Capacitor Preferences serialises per-key writes platform-side, so concurrent `put` calls to different keys do not interfere. Concurrent `put` calls to the *same* key are last-writer-wins; this is fine for the use cases (settings written from a single UI thread).

## Tests

Tests live at `src/persistence/preferences/__tests__/kv.browser.test.ts` and run in the browser tier (`pnpm test:browser`) under real Capacitor Preferences via the `@capacitor/preferences` web implementation. Coverage includes round-trip property tests over arbitrary JSON values, namespace isolation, corrupted-JSON null fallback, concurrent-put safety, and clear-by-namespace boundaries.

There is no node-tier test suite for `kv` — Capacitor Preferences requires a browser environment to exercise the web path. The behaviour under iOS/Android is the platform's responsibility (Capacitor's own tests).

## What `src/persistence/` does NOT provide

- Relational queries → `src/persistence/sqlite/`
- Bulk updates / transactions → `src/persistence/sqlite/`
- Migration versioning → `src/persistence/sqlite/`
- Game state save/resume → `src/sim/` (broker), backed by `src/persistence/sqlite/`
- Encrypted storage → out of scope; Capacitor Preferences is plain text on every platform

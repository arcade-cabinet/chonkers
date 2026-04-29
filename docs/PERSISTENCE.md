---
title: Persistence
updated: 2026-04-29
status: current
domain: technical
---

# Persistence

`src/persistence/` is the pure-transport layer for chonkers' on-device storage. It exposes two surfaces — `kv` for typed JSON key-value pairs, and `db` for raw SQL — backed by Capacitor's official storage modules. Capacitor handles platform routing (localStorage on web, UserDefaults on iOS, SharedPreferences on Android, and SQLite via jeep-sqlite/sql.js on web or platform-native SQLite on iOS/Android), so the package contains no router code we wrote ourselves.

The package has **zero knowledge of game-specific concepts.** It does not define `matches`, `moves`, `decision_traces`, or any other chonkers table. Schema lives in `src/schema/`; typed data access lives in `src/store/`. Both depend on persistence; neither is part of it. This separation makes `src/persistence/` portable across arcade-cabinet projects with a single directory copy.

## Two surfaces

```
src/persistence/
├── index.ts                    # barrel: exports { kv, db }
├── kv.ts                       # typed wrapper over @capacitor/preferences
├── db/
│   ├── connection.ts           # exists, connect, close
│   ├── exec.ts                 # exec, query, transaction (methods on DbConnection)
│   ├── jeep.ts                 # one-time jeep-sqlite custom-element registration on web
│   └── index.ts                # barrel for the db sub-namespace
└── __tests__/                  # browser-tier tests; same code path as production web
```

A single import statement gives consumers everything:

```ts
import { kv, db } from '@/persistence';
```

## `kv` surface

`@capacitor/preferences` IS the platform router. On web it falls back to `localStorage` automatically. On iOS it uses `UserDefaults`. On Android it uses `SharedPreferences`. The `kv` wrapper adds typed JSON serialization + namespace encoding — about 30 lines total.

### API

```ts
export const kv: {
  /**
   * Get a JSON-serializable value by namespace + key.
   * Returns null if missing OR if the stored value isn't valid JSON
   * (corrupted by an external writer or a partial-write crash).
   */
  get<T>(namespace: string, key: string): Promise<T | null>;

  /**
   * Set a JSON-serializable value by namespace + key.
   * Idempotent. Concurrent puts to different keys do not interfere.
   */
  put<T>(namespace: string, key: string, value: T): Promise<void>;

  /** Remove a single key. No-op if absent. */
  remove(namespace: string, key: string): Promise<void>;

  /** List every key+value in a namespace. Skips entries whose JSON is corrupted. */
  list<T>(namespace: string): Promise<Array<{ key: string; value: T }>>;

  /** Clear every key in a namespace, OR every key the package owns when no namespace given. */
  clear(namespace?: string): Promise<void>;
};
```

### Encoding

Keys are stored under Capacitor Preferences as `${namespace}::${key}`. The `::` separator prevents cross-namespace collisions (no namespace contains `::` in chonkers usage; future projects vendoring this package should avoid it too). `clear(namespace)` iterates all keys and removes those matching the namespace prefix.

### Example

```ts
import { kv } from '@/persistence';

interface Settings {
  volume: number;
  muted: boolean;
}

await kv.put<Settings>('settings', 'current', { volume: 0.7, muted: false });
const settings = await kv.get<Settings>('settings', 'current');
//    ^? Settings | null

const allSettings = await kv.list<Settings>('settings');
//    ^? Array<{ key: string; value: Settings }>

await kv.remove('settings', 'current');
await kv.clear('settings');     // remove every settings entry
await kv.clear();                // remove every key the package owns
```

## `db` surface

`@capacitor-community/sqlite` is the platform router for SQL. On web it falls back to `jeep-sqlite` (which uses sql.js under the hood). On iOS/Android it uses platform-native SQLite. The `db` wrapper exposes connection lifecycle + raw SQL execution — and **nothing else.** The package does not know what tables exist, what columns mean, or what JSON blobs decode into.

### API

```ts
export const db: {
  /** Returns true if a database with the given name exists. */
  exists(name: string): Promise<boolean>;

  /**
   * Open or create a database. Idempotent — calling twice with the same
   * args returns the same connection. Schema bootstrap is the caller's
   * responsibility (see src/schema/ for chonkers-specific migrations).
   */
  connect(name: string, version: number): Promise<DbConnection>;

  /** Close the connection. Subsequent `connect` calls reopen it. */
  close(name: string): Promise<void>;
};

export interface DbConnection {
  /**
   * Execute a write statement (INSERT/UPDATE/DELETE/DDL). Goes through
   * an internal write queue that serializes concurrent calls; reads
   * (`query`) bypass the queue.
   */
  exec(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Execute a SELECT and return typed rows. Reader path; not serialized
   * against writes. Caller is responsible for consistency if reads
   * interleave with concurrent writes.
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Run `fn` inside `BEGIN`/`COMMIT`. If `fn` throws, the transaction
   * rolls back and the error propagates. The `tx` parameter exposes the
   * same `exec`/`query` shape but is bound to the transaction; writes
   * through `tx` are not durable until the outer call resolves.
   *
   * Nested transactions are flat — calling `transaction` inside a
   * `transaction` callback executes the inner block as part of the
   * outer transaction (no SAVEPOINTs are emitted).
   */
  transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T>;
}
```

### Schema is a separate concern

The `db` surface does **not** apply migrations, manage versions, or know what tables exist. Consumers wanting structured tables call `db.exec` to create them. For chonkers, this happens via `src/schema/` and its forward-only migration runner (separate PRD).

When `db.connect(name, version)` is called for the first time on a given name, the database is created empty (zero tables). The caller is expected to call `db.exec('CREATE TABLE ...')` immediately after — typically through a higher-level helper like `bootstrapChonkersSchema(name)` from `src/schema/`.

### Foreign keys

SQLite's foreign key enforcement is opt-in per connection — you must `PRAGMA foreign_keys = ON;` after open or constraints silently no-op. The `db.connect` implementation issues this PRAGMA automatically on every new connection. Consumers don't need to remember to do it.

### Example

```ts
import { db } from '@/persistence';

const conn = await db.connect('my-app', 1);

// DDL — define schema yourself (or via @/schema)
await conn.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// Insert with parameter binding (NEVER concatenate user input into SQL)
await conn.exec(
  'INSERT INTO notes (id, payload, created_at) VALUES (?, ?, ?)',
  ['n-1', JSON.stringify({ title: 'hello', tags: ['x', 'y'] }), new Date().toISOString()],
);

// Query — typed return
const rows = await conn.query<{ id: string; payload: string }>(
  'SELECT id, payload FROM notes WHERE id = ?',
  ['n-1'],
);
console.log(rows[0]);
//                ^? { id: string; payload: string } | undefined

// Transaction — atomic writes
await conn.transaction(async (tx) => {
  await tx.exec('UPDATE notes SET payload = ? WHERE id = ?', ['{}', 'n-1']);
  await tx.exec('UPDATE notes SET payload = ? WHERE id = ?', ['null', 'n-2']);
  // If either exec throws, the transaction rolls back automatically.
});

await db.close('my-app');
```

## JSON-column workflow

SQLite supports JSON natively via `json_extract`, `json_each`, `json_object`, and `json_array`. The recommended pattern for storing structured app data is to use `TEXT` columns and let consumers JSON-encode their values:

```ts
const conn = await db.connect('my-app', 1);

await conn.exec('CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');

// Insert structured data
await conn.exec(
  'INSERT INTO blobs (id, payload) VALUES (?, ?)',
  ['b1', JSON.stringify({ score: 42, tags: ['alpha', 'beta'] })],
);

// Query INTO the JSON via json_extract
const rows = await conn.query<{ score: number; first_tag: string }>(
  `SELECT
     json_extract(payload, '$.score') AS score,
     json_extract(payload, '$.tags[0]') AS first_tag
   FROM blobs WHERE id = ?`,
  ['b1'],
);
expect(rows[0]?.score).toBe(42);
expect(rows[0]?.first_tag).toBe('alpha');
```

This pattern is exactly how chonkers stores AI decision snapshots: the `matches.ai_snapshot_json` column (defined in `src/schema/chonkers/005-ai-snapshot.sql`) holds a JSON-encoded `AiSnapshot` value produced by `dumpAiState()` from `@/ai`. The persistence layer doesn't know what's in the blob — it just stores TEXT. The schema layer doesn't know either — it just defines a TEXT column. The store layer (`src/store/snapshot.ts`) is the only place that types the column's content.

This three-layer separation — transport / schema / typed access — keeps each layer narrow. Persistence stays generic (portable). Schema stays declarative (forward-only SQL). Store stays type-safe (typed wrappers, single source of TypeScript types).

## Test environment

All persistence tests run in **vitest browser tier** (`@vitest/browser` + `@vitest/browser-playwright` against Chromium). The same code path as production web. No node-only test backends, no `better-sqlite3`, no in-memory shims that drift from production.

Per-test isolation:

- Each test allocates a unique DB name via `crypto.randomUUID()`.
- `db.connect(name, version)` creates a fresh DB if it doesn't exist — no schema, no rows.
- `afterEach` calls `db.close(name)` to release the connection.
- A session-level cleanup hook removes all `chonkers-test-*` DBs from OPFS at teardown.

The setup file (`__tests__/_setup.ts`) registers the `jeep-sqlite` custom element once per test session, so individual tests don't pay that cost.

## Environment variable surface

| Var | Effect |
|---|---|
| `PERSISTENCE_LOG_QUERIES=1` | Log every `exec` / `query` call to console (debugging only). Off in production builds. |

That's the entire override surface. Per-DB-name choice is the consumer's; reset semantics are the consumer's. Persistence has no opinion on naming or lifecycle outside what's documented above.

## Portability

Vendoring `src/persistence/` into another project:

1. Copy the directory verbatim (`src/persistence/` and its `__tests__/` if you want the test suite).
2. Confirm your `package.json` has `@capacitor/core`, `@capacitor/preferences`, `@capacitor-community/sqlite`, and `jeep-sqlite` as dependencies (versions matched to chonkers' `package.json`).
3. Confirm your `tsconfig.json` resolves `@/persistence` to the directory you just copied.
4. Done. The package needs no project-specific configuration.

What's NOT in the package and stays your responsibility:

- Schema migrations (use a migration runner like `src/schema/`'s).
- Typed data access (a `src/store/` equivalent for your tables).
- Test fixtures (the persistence tests are self-contained but exercise generic patterns; your project's test fixtures should live under your own `__tests__/`).

The package has zero knowledge of chonkers. A grep verifies:

```bash
grep -r "match\|move\|chonker\|engine\|ai\|sim" src/persistence --include='*.ts'
# returns nothing (modulo "schema/migrations" docs comments referencing src/schema/)
```

## Why no router code

`@capacitor/preferences` and `@capacitor-community/sqlite` ARE the routers. Capacitor's plugin model handles the per-platform dispatch (localStorage / UserDefaults / SharedPreferences for kv; jeep-sqlite / native SQLite for db). Writing our own routing layer on top would duplicate Capacitor's work, hide platform-specific behavior, and impose a maintenance burden every time Capacitor's surface evolves.

The persistence package is therefore **structurally minimal**: a kv wrapper for typed JSON serialization (~30 lines) + a db wrapper for connection lifecycle and write-queue serialization (~150 lines including jeep-sqlite registration). Together the package is under ~250 lines of TypeScript. That's the correct size for a transport layer.

## Why browser-tier tests

The same code path as production web. No node-only divergence. Bugs that surface only on jeep-sqlite (custom-element registration races, OPFS quota errors, sql.js WASM-loading edge cases) are caught by tests because tests run on the same stack. The trade-off — slightly slower test runs than node-tier — is paid once at design time and forgotten.

If chonkers ever needs a node-tier test that touches persistence (currently none), the path is:

- Use `vitest-environment-happy-dom` (a small DOM polyfill) and load jeep-sqlite under it. Probably works for kv + simple db usage; YMMV for advanced features.
- Or factor the test into a non-persistence-dependent shape and run it node-tier.

We do NOT introduce `better-sqlite3` or any other node-only SQLite engine. That would create a second backend that the production code never exercises, defeating the whole purpose of testing through the same path.

## Cross-package import rules

The package's portability is enforced via `.claude/gates.json`:

- **Implementation files** (`src/persistence/**.ts`, NOT `__tests__/`) MAY import only from:
  - `@capacitor/core`, `@capacitor/preferences`, `@capacitor-community/sqlite`
  - `jeep-sqlite/loader`
  - Web Crypto API, `node:crypto`, other stdlib
- **Test files** (`src/persistence/__tests__/**`) MAY ALSO import from `@/persistence` (the package's own barrel) — they're testing the public surface, after all.
- **No file in the package** may import from `@/engine`, `@/ai`, `@/sim`, `@/store`, `@/schema`, or any chonkers-specific module. Game logic doesn't belong in transport.

Verifying:

```bash
# Implementation files only — should return zero
grep -r "from '@/" src/persistence --exclude-dir=__tests__

# No relative escapes from anywhere in the package
grep -r "from '\\.\\./\\.\\./" src/persistence
```

Both must return zero hits for the package to remain portable.

# PRD: src/persistence — generic Capacitor-backed transport

**Created:** 2026-04-29
**Status:** ACTIVE
**Owner:** jbogaty
**Acceptance:** A standalone, fully portable `src/persistence/` package exposing two surfaces — `kv` (typed JSON KV via `@capacitor/preferences`) and `db` (raw SQL transport via `@capacitor-community/sqlite` + `jeep-sqlite`) — with full property-test coverage and zero knowledge of game-specific concerns.

---

## Why this is its own PRD

`src/persistence/` is **transport**. It answers two questions:

- "What value should I store under this key?"
- "What value did you store under this key?"

That's KV. For relational data, the questions become "execute this SQL with these parameters" and "return rows from this query as typed values." **The persistence package does not know what tables exist, what their columns mean, or what JSON blobs decode into.** Schema, migrations, typed data access, and game-specific shapes are all separate concerns living in separate packages.

A persistence package that names tables `matches`, defines `MatchRecord`, or knows about `ai_snapshot_json` columns is not generic. By keeping persistence at pure transport level, we get:

- True portability — any project vendors `src/persistence/` and uses it for anything.
- Clean separation — schema lives in `src/schema/`, typed access lives in `src/store/`, both under their own PRDs.
- No version churn — when a future feature changes a table shape, persistence doesn't change; only the schema migration + the affected store module changes.

This PRD must complete and merge before `schema.prq.md` (which depends on it) and `logic-surfaces-and-broker.prq.md` (which depends on both).

---

## Goal

Land `src/persistence/` as a generic transport package that:

1. Exposes two surfaces — `kv` and `db`.
2. `kv` is a thin typed wrapper over `@capacitor/preferences`. Capacitor handles platform routing (localStorage on web, UserDefaults on iOS, SharedPreferences on Android). We don't write router code.
3. `db` is a thin wrapper over `@capacitor-community/sqlite` (with `jeep-sqlite` web fallback) exposing connection lifecycle (`connect`, `close`, `exists`), raw execution (`exec`, `query`, `transaction`), and nothing else. No tables, no migrations, no schema knowledge.
4. Tests run in **vitest browser tier** so the test path is byte-identical to production web. No node-only test backends, no `better-sqlite3`, no in-memory shims that drift from production.
5. Documents itself completely — `docs/PERSISTENCE.md` is the contract; tests assert the contract; portability instructions guide future projects.

---

## Architecture

### Two surfaces, no router code

```
src/persistence/
├── index.ts                    # barrel: exports { kv, db }
├── kv.ts                       # ~30-line typed wrapper over @capacitor/preferences
├── db/
│   ├── connection.ts           # connect, close, exists — adapted from mean-streets pattern
│   ├── exec.ts                 # exec(sql, params), query<T>(sql, params), transaction(fn)
│   ├── jeep.ts                 # one-time jeep-sqlite custom-element registration on web
│   └── index.ts                # barrel for db sub-namespace
└── __tests__/
    ├── _setup.ts               # browser-tier vitest setup
    ├── kv.test.ts
    ├── db-connection.test.ts
    ├── db-exec.test.ts
    └── db-json.test.ts         # JSON column round-trip via SQLite json_extract — proves blob workflow
```

### kv surface

Capacitor Preferences IS the platform router. On web it falls back to `localStorage`; on iOS it uses `UserDefaults`; on Android `SharedPreferences`. The wrapper is namespace-encoded JSON serialization — about 30 lines of code total.

```ts
// src/persistence/kv.ts (the entire file, sketched)
import { Preferences } from '@capacitor/preferences';

export const kv = {
  async get<T>(namespace: string, key: string): Promise<T | null> { /* ... */ },
  async put<T>(namespace: string, key: string, value: T): Promise<void> { /* ... */ },
  async remove(namespace: string, key: string): Promise<void> { /* ... */ },
  async list<T>(namespace: string): Promise<Array<{ key: string; value: T }>> { /* ... */ },
  async clear(namespace?: string): Promise<void> { /* ... */ },
} as const;
```

Corrupted JSON (legacy or external writer) returns `null` rather than throwing. Concurrent puts to different keys don't interfere (Capacitor Preferences serializes per-key writes platform-side). Namespaces are encoded as `${namespace}::${key}` to prevent cross-namespace collisions.

### db surface

The `db` surface exposes:

```ts
// Connection lifecycle
db.exists(name: string): Promise<boolean>;
db.connect(name: string, version: number): Promise<DbConnection>;
db.close(name: string): Promise<void>;

// On a connection
connection.exec(sql: string, params?: unknown[]): Promise<void>;     // INSERT/UPDATE/DELETE/DDL
connection.query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
connection.transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T>;
```

The `DbConnection` type wraps `SQLiteDBConnection` from `@capacitor-community/sqlite` and exposes only the three methods above. Internally `exec` and `query` go through a write queue (borrowed from mean-streets's `withDatabaseWriteLock` pattern) to serialize concurrent writes; reads bypass the queue.

`transaction(fn)` runs `fn` inside `BEGIN; ... COMMIT;` (or `ROLLBACK` on throw). The `tx` parameter is a `DbConnection` whose writes are bound to that transaction.

That's the entire surface. The persistence package has zero knowledge of any specific schema. **A consumer wanting structured tables calls `db.exec` to create them and `db.query` to read them — but those calls live in `src/schema/` (for DDL) and `src/store/` (for typed reads), not in persistence.**

### JSON-column workflow

SQLite supports JSON natively via `json_extract`, `json_each`, `json_object`, `json_array`. The persistence layer doesn't need to model the schema — consumers pass JSON-encoded TEXT to `exec` and use SQLite's JSON functions in `query`. This pattern is exactly how the AI's `ai_snapshot_json` column will work in chonkers, and how arbitrary structured data lives in this transport.

`db-json.test.ts` proves the workflow end-to-end:

```ts
// Test: insert a row with a JSON blob, query into the JSON via json_extract
await conn.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
await conn.exec('INSERT INTO blobs (id, payload) VALUES (?, ?)', [
  'b1', JSON.stringify({ score: 42, tags: ['alpha', 'beta'] }),
]);
const rows = await conn.query<{ score: number; first_tag: string }>(
  'SELECT json_extract(payload, "$.score") AS score, json_extract(payload, "$.tags[0]") AS first_tag FROM blobs WHERE id = ?',
  ['b1'],
);
expect(rows[0]?.score).toBe(42);
expect(rows[0]?.first_tag).toBe('alpha');
```

This is the only place the JSON workflow lives at the persistence level — proving it works. Every consumer's actual JSON shape is the consumer's concern.

### Connection management

Borrowed from mean-streets `src/platform/persistence/database.ts`:

- One connection per (name, version) pair, cached at module level.
- On web: register `jeep-sqlite` custom element once; call `initWebStore` once; flush via `saveToStore` after each write.
- Write queue serializes mutations across the connection.
- `closeDatabase` releases connection + clears module-level cache.

Multiple concurrent connections to **different** DB names are supported (used heavily for test isolation — each test gets its own DB). The internal cache is keyed by name, so two tests with different names cohabit cleanly.

### Test environment

All persistence tests run in **vitest browser tier** (`@vitest/browser` + `@vitest/browser-playwright` against Chromium). Same code path as production web, exercising the same jeep-sqlite/sql.js stack.

Per-test isolation:

- Each test allocates a unique DB name via `crypto.randomUUID()` (or `os.hostname() + pid + counter` if `randomUUID` is unavailable).
- `db.connect(name, version)` creates a fresh DB if it doesn't exist; on first init the connection is empty (no tables).
- `afterEach` calls `db.close(name)` to release the connection.
- A session-level cleanup hook removes all `chonkers-test-*` DBs from OPFS at teardown.

The setup file (`__tests__/_setup.ts`) registers the `jeep-sqlite` custom element once per test session; individual tests don't pay that cost.

### Environment variable surface

| Var | Effect |
|---|---|
| `PERSISTENCE_LOG_QUERIES=1` | Log every `exec` / `query` call to console (debugging only) |

That's the entire override surface. There is no `PERSISTENCE_DB_NAME` (each consumer chooses its own DB name); there is no `PERSISTENCE_DB_RESET_ON_INIT` (consumers explicitly drop tables they want reset). The persistence package has no opinion on naming or reset semantics — those are consumer concerns.

---

## Documentation

### `docs/PERSISTENCE.md` (new doc, lives in chonkers but is portable)

Sections:

- **Overview** — two surfaces (kv + db), Capacitor as the platform abstraction, jeep-sqlite as the web fallback.
- **`kv` surface** — full API reference with type signatures and example usage.
- **`db` surface** — full API reference: `exists`, `connect`, `close`, plus `exec`/`query`/`transaction` on a connection. Explicit note: **persistence does not own schema or migrations.**
- **JSON-column workflow** — example using `json_extract` to query into JSON blobs. The recommended pattern for storing structured app data without schema bloat.
- **Test environment** — how the browser-tier setup works, isolation guarantees, OPFS cleanup.
- **Portability** — instructions for vendoring this package into another project: copy the directory, you're done. Schema and typed access are caller-defined.
- **Why no router code** — Capacitor Preferences and Capacitor SQLite are the routers; nothing for us to write.
- **Why browser-tier tests** — same code path as production, no node-only divergence.

### `src/persistence/README.md`

Inline package README. Quick-start for `kv` and `db`. Cross-link to `docs/PERSISTENCE.md`.

---

## Tasks

### A. Documentation (parallel; no code dependencies)

#### A1. Author `docs/PERSISTENCE.md`

**Description:** The persistence contract document. Covers all sections above. Drives the test specifications.

**Files:** `docs/PERSISTENCE.md`

**Acceptance criteria:**
- Frontmatter present (title, updated, status, domain)
- All eight sections present with worked examples
- Every public API in `kv` and `db` documented with type signature
- JSON-column workflow example present
- Portability section describes vendoring with concrete steps
- Explicitly states that schema, migrations, and typed access are NOT this package's concern

#### A2. Author `src/persistence/README.md`

**Description:** Inline package README. Quick-start examples for `kv` and `db`. Cross-link to `docs/PERSISTENCE.md`.

**Files:** `src/persistence/README.md`

**Acceptance criteria:**
- Frontmatter present
- Quick-start example for `kv` (settings round-trip)
- Quick-start example for `db` (create table, insert with JSON column, query via `json_extract`)
- Cross-link present

---

### B. Dependencies

#### B1. Install required packages

**Description:** Add `@capacitor/preferences`, `@capacitor-community/sqlite`, `jeep-sqlite`. `@capacitor/core` is already present.

**Files:** `package.json`, `pnpm-lock.yaml`

**Acceptance criteria:**
- All three deps listed as dependencies (not devDependencies)
- `pnpm install` clean
- `pnpm typecheck` clean (imports in not-yet-written files don't break the build because they don't exist yet — but the deps must resolve)

---

### C. Tests written first (TDD; red bar verified before any implementation)

#### C1. Author `src/persistence/__tests__/_setup.ts`

**Description:** Vitest browser-tier setup. Idempotent jeep-sqlite custom-element registration. Session-level OPFS cleanup hook for `chonkers-test-*` DBs at teardown.

**Files:** `src/persistence/__tests__/_setup.ts`

**Acceptance criteria:**
- File exports a setup function vitest will call
- Custom-element registration is idempotent across test files in a session
- Session teardown removes test DBs from OPFS

#### C2. Write `src/persistence/__tests__/kv.test.ts`

**Description:** Property tests for `kv`. Asserts: `put` then `get` round-trips arbitrary JSON-serializable values; `remove` deletes; `list` returns all entries in a namespace; `clear` empties one namespace or all; namespaces don't collide; corrupted JSON returns `null` rather than throwing; concurrent puts to different keys don't interfere.

**Files:** `src/persistence/__tests__/kv.test.ts`

**Acceptance criteria:**
- File exists; imports `{ kv }` from `@/persistence`
- ≥10 distinct property assertions
- Each property runs ≥50 fast-check iterations
- Concurrent-puts test runs ≥20 parallel writes
- Corrupted-JSON test inserts invalid JSON via `Preferences.set` directly, asserts `kv.get` returns `null`
- Test file fails when run before D1 lands

#### C3. Write `src/persistence/__tests__/db-connection.test.ts`

**Description:** Tests for connection lifecycle. Asserts: `exists(name)` returns false for a never-created DB, true after `connect`; `connect` is idempotent (calling twice returns the same connection); `close` releases properly (subsequent `exists` still true on web because OPFS persists, but the in-memory connection is gone); two concurrent connections to different names don't collide.

**Files:** `src/persistence/__tests__/db-connection.test.ts`

**Acceptance criteria:**
- File exists
- ≥6 distinct assertions
- Concurrent-connection test allocates two DBs with different names, writes to each, asserts data is isolated
- Test file fails before D2 lands

#### C4. Write `src/persistence/__tests__/db-exec.test.ts`

**Description:** Tests for raw exec/query/transaction. Asserts: `exec` runs DDL (CREATE TABLE), DML (INSERT/UPDATE/DELETE); `query` returns typed rows; parameter binding prevents SQL injection (passing `'; DROP TABLE x; --` as a param doesn't drop the table); `transaction` commits on success, rolls back on throw; nested transactions are flat (no savepoints — explicit limitation).

**Files:** `src/persistence/__tests__/db-exec.test.ts`

**Acceptance criteria:**
- File exists
- ≥8 distinct assertions
- Injection-attempt parameter does not delete the table
- Transaction-rollback test verifies a thrown error inside `transaction` reverts the inserts
- Test file fails before D3 lands

#### C5. Write `src/persistence/__tests__/db-json.test.ts`

**Description:** Tests for the JSON-column workflow. Asserts: TEXT columns round-trip arbitrary JSON-serializable values; `json_extract` queries into nested objects + arrays; `json_each` iterates array elements; updating a JSON blob via parameterized `exec` is durable.

**Files:** `src/persistence/__tests__/db-json.test.ts`

**Acceptance criteria:**
- File exists
- ≥5 distinct assertions
- `json_extract` queries verify nested-object and array-index access
- Test file fails before D3 lands

---

### D. Implementation

#### D1. Implement `src/persistence/kv.ts`

**Description:** ~30-line typed wrapper over `@capacitor/preferences`. `get`/`put`/`remove`/`list`/`clear`. Namespace::key encoding. Corrupted JSON returns `null`.

**Files:** `src/persistence/kv.ts`

**Acceptance criteria:**
- C2 tests pass
- Module exports `kv` as `const`
- All API methods typed with generics where applicable
- File ≤50 lines including imports + JSDoc

#### D2. Implement `src/persistence/db/connection.ts` + `db/jeep.ts`

**Description:** Connection lifecycle borrowed from mean-streets `database.ts` pattern. `exists(name)` checks `sqlite.isConnection(name, false)`. `connect(name, version)` creates or retrieves a connection, opens it, returns a `DbConnection`. `close(name)` releases. `db/jeep.ts` is the one-time custom-element registration on web (extracted as its own module for clarity).

**Files:** `src/persistence/db/connection.ts`, `src/persistence/db/jeep.ts`

**Acceptance criteria:**
- C3 tests pass
- `connect` is idempotent (two calls with the same args return the same connection)
- Two concurrent connections to different names operate independently
- On web, `jeep-sqlite` is registered exactly once per session

#### D3. Implement `src/persistence/db/exec.ts`

**Description:** `exec(sql, params)`, `query<T>(sql, params)`, `transaction(fn)`. The `DbConnection` returned by `connect` exposes these as methods. Internal write queue (borrowed from mean-streets `withDatabaseWriteLock`) serializes writes; reads bypass the queue. Transaction wraps `BEGIN`/`COMMIT`/`ROLLBACK`.

**Files:** `src/persistence/db/exec.ts`

**Acceptance criteria:**
- C4 + C5 tests pass
- Write queue serializes concurrent `exec` calls (verified by writing two values in parallel and asserting both end up in the DB)
- Transaction rollback verified

#### D4. Author `src/persistence/db/index.ts` barrel

**Description:** Exports the `db` namespace combining `exists`, `connect`, `close`. The connection-bound `exec`/`query`/`transaction` are exposed as methods on the returned `DbConnection`, not as standalone exports.

**Files:** `src/persistence/db/index.ts`

**Acceptance criteria:**
- Exports `db` as a const namespace
- All C-test imports resolve

#### D5. Author `src/persistence/index.ts` top-level barrel

**Description:** Exports `kv` and `db`.

**Files:** `src/persistence/index.ts`

**Acceptance criteria:**
- Single import `import { kv, db } from '@/persistence'` works
- All test files pass

---

### E. Verification

#### E1. Run full persistence test suite

**Description:** All persistence tests run green in browser tier. Manual verification: timing reasonable.

**Files:** none — process step

**Acceptance criteria:**
- `pnpm test:browser src/persistence` passes 100%
- Total runtime ≤30s
- No flaky tests across 5 consecutive runs

#### E2. Verify portability

**Description:** Manual verification that `src/persistence/` is truly portable. Read every import; confirm zero references to `@/engine`, `@/ai`, `@/sim`, `@/store`, `@/schema`, or any chonkers-specific module. Only allowed imports outside the package are `@capacitor/core`, `@capacitor/preferences`, `@capacitor-community/sqlite`, `jeep-sqlite`.

**Files:** none — process step

**Acceptance criteria:**
- `grep -r "from '@/" src/persistence` returns zero results
- `grep -r "from '\\.\\./\\.\\./" src/persistence` returns zero results (no relative imports escaping the package)
- All non-Capacitor / non-jeep-sqlite imports are stdlib (Web Crypto API for UUIDs, etc.)
- Manual scan confirms no chonkers-specific table names, column names, or types referenced anywhere in the package

#### E3. Demonstration commit

**Description:** A small example test that creates a temporary DB, defines a table with a JSON column, inserts a row, queries with `json_extract`, deletes the row, drops the table, closes the DB. Proves end-to-end usability.

**Files:** `src/persistence/__tests__/demonstration.test.ts`

**Acceptance criteria:**
- Full lifecycle demonstrated
- No mocks
- Test passes in browser tier

---

## Configuration

```yaml
batch_name: chonkers-persistence
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1
```

---

## Execution order

```
A1, A2 (docs first; drive test specs)
   ↓
B1 (deps installed)
   ↓
C1 (test setup)
   ↓
C2, C3, C4, C5 (test files in parallel after C1)
   ↓
D1 (kv impl after C2)
D2 (connection impl after C3)
   ↓
D3 (exec impl after C4 + C5 + D2)
   ↓
D4 (db barrel after D2 + D3)
   ↓
D5 (top barrel after D1 + D4)
   ↓
E1, E2, E3 (verification in parallel)
```

---

## Risks

- **jeep-sqlite version drift.** Pin `jeep-sqlite` to a known-working version (match what mean-streets uses). Don't bump without re-verifying.
- **Vitest browser-tier custom-element races.** Mitigated by `_setup.ts` ensuring single registration per session and `customElements.whenDefined` await.
- **OPFS quota in browser tests.** Tests with unique DB names accumulate OPFS entries. Mitigated by session-level cleanup hook + `db.close` in `afterEach`.

---

## Definition of Done

- All A* documentation tasks merged.
- All B* dependency tasks merged.
- All C* test files merged and demonstrated red before implementation.
- All D* implementation tasks merged.
- E1 verification passes (suite green, ≤30s, no flake across 5 runs).
- E2 verification passes (zero cross-package imports, manual scan clean).
- E3 demonstration test passes.
- `pnpm typecheck && pnpm lint && pnpm test:browser src/persistence && pnpm build` clean.
- `src/persistence/` is provably portable: zero `@/...` imports outside its boundary, zero relative imports escaping the package, no chonkers-specific naming anywhere.

After this PRD merges, downstream PRDs (schema, store, engine, AI, sim, broker) treat `src/persistence/` as an installed dependency and consume `kv` + `db` from its barrel.

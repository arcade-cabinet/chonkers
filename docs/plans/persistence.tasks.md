# Batch: chonkers-persistence

**Created:** 2026-04-29
**Config:** stop_on_failure=true, auto_commit=true, reviewer_dispatch=parallel-background-per-commit
**PRD:** [persistence.prq.md](./persistence.prq.md)

`src/persistence/` is **generic transport only**. Two surfaces: `kv` (typed JSON KV via `@capacitor/preferences`) and `db` (raw SQL transport via `@capacitor-community/sqlite` + `jeep-sqlite`). Zero knowledge of game-specific concepts. Schema lives in `src/schema/` (separate PRD); typed data access lives in `src/store/` (separate PRD inside the logic PRD's groups).

## Tasks

1. [P1] **Author docs/PERSISTENCE.md** — Two-surface contract (kv + db), Capacitor as platform router, jeep-sqlite web fallback, JSON-column workflow, env vars, portability instructions, rationale.
   - Files: docs/PERSISTENCE.md
   - Criteria: frontmatter present; all 8 sections (Overview, kv, db, JSON-column workflow, test env, portability, rationale, env vars) present with examples; every public API documented with type signature; explicitly states schema/migrations/typed-access are NOT this package's concern

2. [P1] **Author src/persistence/README.md** — Inline package README; quick-start examples for kv + db; cross-link to docs/PERSISTENCE.md.
   - Files: src/persistence/README.md
   - Criteria: frontmatter present; quick-start for kv (settings round-trip); quick-start for db (CREATE TABLE + INSERT with JSON column + SELECT via json_extract); cross-link present

3. [P1] **Install dependencies** — Add @capacitor/preferences, @capacitor-community/sqlite, jeep-sqlite to dependencies.
   - Files: package.json, pnpm-lock.yaml
   - Criteria: three deps listed; pnpm install clean; pnpm typecheck clean

4. [P2] **Author src/persistence/__tests__/_setup.ts** — Browser-tier vitest setup; idempotent jeep-sqlite custom-element registration; afterEach closeDatabase per test; session-level OPFS cleanup hook.
   - Files: src/persistence/__tests__/_setup.ts
   - Criteria: setup function exported; custom-element registration idempotent across test files; each test gets unique DB via crypto.randomUUID(); session teardown removes test DBs from OPFS

5. [P2] **Write src/persistence/__tests__/kv.test.ts** — Property tests for kv: round-trip JSON values, remove, list, clear (one namespace + all), namespace isolation, corrupted JSON returns null, concurrent puts to different keys don't interfere.
   - Files: src/persistence/__tests__/kv.test.ts
   - Criteria: imports `{ kv }` from @/persistence; ≥10 properties; ≥50 fast-check iterations each; concurrent ≥20 parallel writes; corrupted-JSON test inserts invalid JSON via Preferences.set directly and asserts kv.get returns null; fails before D1 lands

6. [P2] **Write src/persistence/__tests__/db-connection.test.ts** — Tests for connection lifecycle: exists() returns false for never-created DB and true after connect; connect() is idempotent (two calls return same connection); close() releases properly; two concurrent connections to different names operate independently with isolated data.
   - Files: src/persistence/__tests__/db-connection.test.ts
   - Criteria: ≥6 distinct assertions; concurrent-connection test allocates two DBs with different names + writes to each + asserts data isolation; fails before D2 lands

7. [P2] **Write src/persistence/__tests__/db-exec.test.ts** — Tests for raw exec/query/transaction: exec runs DDL + DML; query returns typed rows; parameter binding prevents SQL injection (passing `'; DROP TABLE x; --` as a param doesn't drop); transaction commits on success + rolls back on throw; nested transactions are flat.
   - Files: src/persistence/__tests__/db-exec.test.ts
   - Criteria: ≥8 distinct assertions; injection-attempt parameter does not delete the table; transaction-rollback test verifies thrown error inside transaction reverts all inserts; fails before D3 lands

8. [P2] **Write src/persistence/__tests__/db-json.test.ts** — Tests for JSON-column workflow: TEXT columns round-trip arbitrary JSON-serializable values; json_extract queries into nested objects + arrays; json_each iterates array elements; updating a JSON blob via parameterized exec is durable.
   - Files: src/persistence/__tests__/db-json.test.ts
   - Criteria: ≥5 distinct assertions; json_extract queries verify nested-object and array-index access; fails before D3 lands

9. [P3] **Implement src/persistence/kv.ts** — ~30-line typed wrapper over @capacitor/preferences. get/put/remove/list/clear with namespace::key encoding. Corrupted JSON treated as null.
   - Files: src/persistence/kv.ts
   - Criteria: task 5 tests pass; module exports `kv` as const; all methods typed with generics where applicable; file ≤50 lines including imports + JSDoc

10. [P3] **Implement src/persistence/db/connection.ts + db/jeep.ts** — Connection lifecycle borrowed from mean-streets database.ts pattern. exists(name), connect(name, version), close(name). On web: register jeep-sqlite custom element via db/jeep.ts (one-time per session); initWebStore on first connect; flush via saveToStore after writes via the write queue.
   - Files: src/persistence/db/connection.ts, src/persistence/db/jeep.ts
   - Criteria: task 6 tests pass; connect is idempotent; two concurrent connections to different names operate independently; jeep-sqlite registered exactly once per session

11. [P3] **Implement src/persistence/db/exec.ts** — exec(sql, params), query<T>(sql, params), transaction(fn) as methods on the DbConnection returned by connect. Internal write queue serializes mutations; reads bypass the queue. Transaction wraps BEGIN/COMMIT/ROLLBACK.
   - Files: src/persistence/db/exec.ts
   - Criteria: tasks 7 + 8 tests pass; write queue serializes concurrent exec calls (verified by writing two values in parallel + asserting both end up in the DB); transaction rollback verified

12. [P3] **Author src/persistence/db/index.ts barrel** — Exports the db namespace with exists, connect, close. The connection-bound exec/query/transaction are methods on the returned DbConnection, not standalone exports.
   - Files: src/persistence/db/index.ts
   - Criteria: `db` exported as const namespace; all C-test imports resolve

13. [P3] **Author src/persistence/index.ts top-level barrel** — Exports `{ kv, db }`.
   - Files: src/persistence/index.ts
   - Criteria: `import { kv, db } from '@/persistence'` works; all test files pass

14. [P4] **Run full persistence test suite** — pnpm test:browser src/persistence passes 100%, ≤30s, no flaky tests across 5 runs.
   - Files: none
   - Criteria: 100% pass; total runtime ≤30s; 5 consecutive clean runs

15. [P4] **Verify portability** — Implementation files in src/persistence (excluding __tests__/) have zero `@/...` imports and zero `../../` relative imports that escape the package; only Capacitor + jeep-sqlite + stdlib imports. Tests under `__tests__/` are exempt because they MAY import `{ kv, db }` from `@/persistence` (the typed barrel — that's the whole point of testing the package's public surface). Manual scan confirms no game-specific table names, column names, or types referenced anywhere in implementation OR test code.
   - Files: none — process step (grep + manual scan)
   - Criteria: `grep -r "from '@/" src/persistence --exclude-dir=__tests__` returns zero (implementation files self-contained); `grep -r "from '\\.\\./\\.\\./" src/persistence` returns zero (no escaping the package via relative imports, even from tests); only Capacitor + jeep-sqlite + Web Crypto / node:crypto imports allowed in implementation; no chonkers-specific naming anywhere

16. [P4] **Commit demonstration example** — A small example test that creates a temporary DB, defines a table with a JSON column, inserts a row, queries with json_extract, deletes the row, drops the table, closes the DB. Proves end-to-end usability of the generic transport without referencing any chonkers-specific table name.
   - Files: src/persistence/__tests__/demonstration.test.ts
   - Criteria: full lifecycle demonstrated against real Capacitor SQLite; no mocks; passes in browser tier

## Execution Order

```
1, 2, 3 (docs + deps in parallel; no code dependencies)
   ↓
4 (test setup)
   ↓
5, 6, 7, 8 (test files in parallel after 4 — all should fail with module-not-found)
   ↓
9 (kv impl after 5)
10 (connection impl after 6)
   ↓
11 (exec impl after 7 + 8 + 10)
   ↓
12 (db barrel after 10 + 11)
   ↓
13 (top barrel after 9 + 12)
   ↓
14, 15, 16 (verification in parallel)
```

Strict TDD: every test file (tasks 5-8) lands and is verified RED before its corresponding implementation begins. No implementation task starts before its tests are committed.

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

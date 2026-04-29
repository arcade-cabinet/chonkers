# Batch: chonkers-persistence

**Created:** 2026-04-29
**Config:** stop_on_failure=true, auto_commit=true, reviewer_dispatch=parallel-background-per-commit
**PRD:** [persistence.prq.md](./persistence.prq.md)

## Tasks

1.  [P1] **Author docs/PERSISTENCE.md** — Two-surface contract (kv + games), Capacitor as platform router, jeep-sqlite web fallback, schema, env vars, portability instructions, rationale.
    - Files: docs/PERSISTENCE.md
    - Criteria: frontmatter present; all 7 sections (Overview, kv, games, migrations, test env, portability, rationale) present with examples; every public API documented with type signature; SQL schema + env var table present

2.  [P1] **Author src/persistence/README.md** — Inline package README; quick-start examples; cross-link to docs/PERSISTENCE.md.
    - Files: src/persistence/README.md
    - Criteria: frontmatter present; quick-start for kv + games; cross-link present

3.  [P1] **Install dependencies** — Add @capacitor/preferences, @capacitor-community/sqlite, jeep-sqlite to dependencies.
    - Files: package.json, pnpm-lock.yaml
    - Criteria: three deps listed; pnpm install clean; pnpm typecheck clean

4.  [P2] **Author src/persistence/__tests__/_setup.ts** — Browser-tier vitest setup; idempotent jeep-sqlite custom-element registration; unique DB name per test; PERSISTENCE_DB_RESET_ON_INIT=1; afterEach closeDatabase.
    - Files: src/persistence/__tests__/_setup.ts
    - Criteria: setup function exported; custom-element registration idempotent across test files; each test has unique DB; cleanup runs reliably

5.  [P2] **Write src/persistence/__tests__/kv.test.ts** — Property tests for kv: round-trip JSON values, remove, list, clear, namespace isolation, corrupted JSON returns null, concurrent puts.
    - Files: src/persistence/__tests__/kv.test.ts
    - Criteria: imports `{ kv }` from @/persistence; ≥10 properties; ≥50 fast-check iterations each; concurrent ≥20 parallel writes; corrupted-JSON test inserts invalid JSON and asserts null; fails before D1 lands

6.  [P2] **Write src/persistence/__tests__/games-matches.test.ts** — Tests for matches API: insert, get, finalize, list with filters, cascade-delete, duplicate-id throws, finalize-nonexistent throws.
    - Files: src/persistence/__tests__/games-matches.test.ts
    - Criteria: ≥8 assertions; cascade verified by inserting moves+traces, deleting match, asserting they're gone; fails before D4 lands

7.  [P2] **Write src/persistence/__tests__/games-moves.test.ts** — Tests for moves API: append in order, getMoves ordered by move_index, can't append to nonexistent match, can't append duplicate (match_id, move_index), action_json round-trips arbitrary serializable Action, filter by side.
    - Files: src/persistence/__tests__/games-moves.test.ts
    - Criteria: ≥6 assertions; ≥100 generated Action objects round-trip; order preservation across ≥50 moves per match; fails before D5 lands

8.  [P2] **Write src/persistence/__tests__/games-traces.test.ts** — Tests for decision_traces API: append, get, application-layer integrity check on missing move, trace_json round-trips nontrivial nested objects, cascade-delete with match.
    - Files: src/persistence/__tests__/games-traces.test.ts
    - Criteria: ≥5 assertions; trace round-trip for nested shapes; fails before D6 lands

9.  [P2] **Write src/persistence/__tests__/games-query.test.ts** — Tests for raw query escape hatch: typed return, aggregations work (COUNT, SUM, GROUP BY), parameter binding prevents injection, invalid SQL surfaces clearly.
    - Files: src/persistence/__tests__/games-query.test.ts
    - Criteria: ≥6 assertions; aggregation correctness verified; injection-attempt parameter does not delete the table; fails before D7 lands

10. [P2] **Write src/persistence/__tests__/games-isolation.test.ts** — Tests for concurrent test isolation: two unique PERSISTENCE_DB_NAME values do not see each other's data; closeDatabase releases properly; reset behavior correct.
    - Files: src/persistence/__tests__/games-isolation.test.ts
    - Criteria: concurrent DB names don't share data; reset behavior verified; fails before connection.ts lands

11. [P3] **Implement src/persistence/kv.ts** — ~30-line typed wrapper over @capacitor/preferences. get/put/remove/list/clear with namespace::key encoding. Corrupted JSON treated as null.
    - Files: src/persistence/kv.ts
    - Criteria: task 5 tests pass; module exports `kv` as const; all methods typed with generics where applicable

12. [P3] **Implement src/persistence/games/connection.ts** — Borrowed from mean-streets database.ts. getDatabase, withWriteLock, closeDatabase. PERSISTENCE_DB_NAME and PERSISTENCE_DB_RESET_ON_INIT honored. On web, registers jeep-sqlite custom element + initWebStore + saveToStore after writes.
    - Files: src/persistence/games/connection.ts
    - Criteria: exports getDatabase/withWriteLock/closeDatabase; first getDatabase triggers schema migrations via task 13; reset flag works; closeDatabase releases connection

13. [P3] **Implement src/persistence/games/migrations.ts + schema.sql** — Forward-only schema bootstrap. v1 schema: matches, moves, decision_traces with indexes and foreign keys.
    - Files: src/persistence/games/migrations.ts, src/persistence/games/schema.sql
    - Criteria: schema executes cleanly on fresh DB; idempotent (CREATE IF NOT EXISTS pattern); foreign keys enabled via PRAGMA; indexes present

14. [P3] **Implement src/persistence/games/matches.ts** — insertMatch, finalizeMatch, getMatch, listMatches with optional limit + finishedOnly filters.
    - Files: src/persistence/games/matches.ts
    - Criteria: task 6 tests pass

15. [P3] **Implement src/persistence/games/moves.ts** — appendMove, getMoves.
    - Files: src/persistence/games/moves.ts
    - Criteria: task 7 tests pass

16. [P3] **Implement src/persistence/games/traces.ts** — appendTrace, getTrace.
    - Files: src/persistence/games/traces.ts
    - Criteria: task 8 tests pass

17. [P3] **Implement src/persistence/games/query.ts** — query<T>(sql, params) → Promise<T[]>. Read-only by contract.
    - Files: src/persistence/games/query.ts
    - Criteria: task 9 tests pass

18. [P3] **Author src/persistence/games/index.ts barrel** — Exports games namespace combining matches, moves, traces, query, init, close.
    - Files: src/persistence/games/index.ts
    - Criteria: surface matches docs/PERSISTENCE.md exactly; tasks 6-10 imports resolve

19. [P3] **Author src/persistence/index.ts top-level barrel** — Exports `{ kv, games }`.
    - Files: src/persistence/index.ts
    - Criteria: `import { kv, games } from '@/persistence'` works; all test files pass

20. [P4] **Run full persistence test suite** — pnpm test:browser src/persistence passes 100%, ≤30s, no flaky tests across 5 runs.
    - Files: none
    - Criteria: 100% pass; total runtime ≤30s; 5 consecutive clean runs

21. [P4] **Verify portability** — Zero @/... imports outside src/persistence; zero ../../ relative imports that escape the package; only Capacitor + jeep-sqlite + stdlib imports.
    - Files: none — process step (manual grep)
    - Criteria: `grep -r "from '@/" src/persistence` returns zero; `grep -r "from '\\.\\./\\.\\./" src/persistence` returns zero; only Capacitor + jeep-sqlite + Web Crypto / node:crypto imports allowed

22. [P4] **Commit demonstration example** — Small test that creates a match, appends 50 moves, finalizes, runs aggregate query. Proves the surface is usable end-to-end, not just unit-tested.
    - Files: src/persistence/__tests__/demonstration.test.ts
    - Criteria: full lifecycle (insert, append moves, finalize, query aggregates) executes against real Capacitor SQLite; assertions on aggregate query results match constructed data

## Execution Order

```
1, 2, 3 (docs + deps in parallel; no code dependencies)
   ↓
4 (test setup)
   ↓
5, 6, 7, 8, 9, 10 (test files in parallel after 4 — all should fail with "module not found")
   ↓
11, 12, 13 (kv + connection + migrations — kv parallel with connection+migrations chain)
   ↓
14, 15, 16, 17 (CRUD impls in parallel after 12+13)
   ↓
18 (games barrel after all CRUD)
   ↓
19 (top-level barrel after games barrel)
   ↓
20, 21, 22 (verification in parallel)
```

Strict TDD: every test file (tasks 5-10) lands and is verified RED before its corresponding implementation begins. No implementation task starts before its tests are committed.

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

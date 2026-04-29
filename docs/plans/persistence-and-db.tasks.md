# Batch: chonkers-persistence-and-db

**Created:** 2026-04-29
**Config:** stop_on_failure=true, auto_commit=true, reviewer_dispatch=parallel-background-per-commit
**PRD:** [persistence-and-db.prq.md](./persistence-and-db.prq.md)

The earlier task list (when this PRD was a generic-transport PRD with a separate schema PRQ) has been retired. The new architecture is documented in `docs/DB.md` and `docs/PERSISTENCE.md`. This file enumerates the work that remains on PR #5.

## What is already shipped on this branch

- ✅ Canonical docs rewritten in this branch: STATE.md, ARCHITECTURE.md, PERSISTENCE.md, DB.md, AI.md, TESTING.md.
- ✅ CLAUDE.md architecture cheat-sheet updated to reflect `src/persistence/{preferences,sqlite}/` + `src/store/`.
- ✅ Directive updated to merge PRQ-1 + PRQ-2.
- ✅ `src/persistence/preferences/` (kv.ts) with 13 browser-tier tests passing.
- ✅ Old broken `src/persistence/db/` removed.
- ✅ Old schema-flavoured browser tests removed.
- ✅ jeep-sqlite, sql.js, @types/sql.js retained as deps; `scripts/copy-wasm.mjs` retained; `pre*` script wires retained.

## What remains

### Drizzle setup

1. **Add deps:** `drizzle-orm`, `drizzle-kit` (devDep), `better-sqlite3`, `@types/better-sqlite3` (devDep). Pin `better-sqlite3` to a Node 22-compatible version.
   - Files: `package.json`, `pnpm-lock.yaml`
   - Acceptance: `pnpm install` clean; `pnpm typecheck` clean.

2. **Author `drizzle.config.ts`** at repo root.
   - Files: `drizzle.config.ts`
   - Acceptance: `dialect: "sqlite"`, `schema: "./src/persistence/sqlite/schema/*"`, `out: "./drizzle"`. `pnpm drizzle-kit --version` works.

3. **Author `src/persistence/sqlite/schema/*.ts`** per `docs/DB.md` table catalogue.
   - Files: `src/persistence/sqlite/schema/{matches,moves,aiStates,analyticsAggregates,index}.ts`
   - Acceptance: every column from `docs/DB.md` declared with the right type, default, FK, index. `pnpm typecheck` clean. The exported types (e.g. `Match`, `NewMatch`) are inferable via `$inferSelect` / `$inferInsert`.

4. **Generate migration `drizzle/0000_initial.sql`.**
   - Files: `drizzle/0000_initial.sql`, `drizzle/meta/*`
   - Acceptance: `pnpm drizzle-kit generate` produces non-empty SQL covering all four tables + indices + FKs. Committed to git.

### Test factory + Node-tier coverage

5. **Author `src/persistence/sqlite/__tests__/test-db.ts`** — `makeTestDb({ path? }: { path?: string } = {})` factory. Resolves location: explicit `path` arg > `CHONKERS_TEST_DB_DIR` env > `:memory:`. Applies all `drizzle/*.sql` migrations in order. Returns `{ db: BetterSQLite3Database<typeof schema>, sqlDb: Database }`.
   - Files: `src/persistence/sqlite/__tests__/test-db.ts`
   - Acceptance: in-memory call returns a working drizzle handle with all tables created. With `CHONKERS_TEST_DB_DIR` set, on-disk file is created and survives the test. With explicit `path:`, file written there.

6. **Schema correctness tests.** Verify every committed migration applies cleanly to a fresh DB and produces the expected `sqlite_master` rows.
   - Files: `src/persistence/sqlite/__tests__/schema.test.ts`
   - Acceptance: tables match `docs/DB.md` catalogue; FKs in place; indices in place; PRAGMA user_version matches migration count.

7. **Migration replay determinism tests.** Apply migrations in order; assert PRAGMA user_version progresses 0→1→2→...; assert idempotent application is rejected.
   - Files: `src/persistence/sqlite/__tests__/migrations.test.ts`
   - Acceptance: replaying the same migration twice fails (or is a no-op, depending on idempotency strategy chosen during implementation — captured in test).

### Runtime adapter

8. **Author `src/persistence/sqlite/jeep-web.ts`** — production-quality jeep-sqlite custom-element registration. `wasmpath` set, autosave OFF (autosave conflicts with explicit transactions per the earlier debugging in this branch — dropped from the design). Idempotent across calls, retry on rejection.
   - Files: `src/persistence/sqlite/jeep-web.ts`
   - Acceptance: registration is one-time per session; failure clears the cached promise so callers can retry.

9. **Author `src/persistence/sqlite/client.ts`** — drizzle-orm wired to `@capacitor-community/sqlite` via `drizzle-orm/sqlite-proxy`. Exports `getDb()` (sync, throws if uninitialised) + `getDbAsync()` (lazy memoised init). Per-DB write-lock queue.
   - Files: `src/persistence/sqlite/client.ts`
   - Acceptance: drizzle queries against the proxy adapter actually round-trip values to capacitor-sqlite + back. Write queue serialises concurrent writers.

10. **Author `src/persistence/sqlite/version.ts`** — read/write `PRAGMA user_version`; load served `game-db.meta.json`; compute replay window.
    - Files: `src/persistence/sqlite/version.ts`
    - Acceptance: given served=N and persisted=M (M<N), returns the list of migration files to replay [M+1..N].

11. **Author `src/persistence/sqlite/bootstrap.ts`** — first-run import of `public/game.db` via capacitor-sqlite's `importFromJson`; subsequent-run version detection + replay; failure rollback.
    - Files: `src/persistence/sqlite/bootstrap.ts`
    - Acceptance: fresh OPFS state imports the asset; same OPFS on next run is a no-op; bumping served version triggers replay.

12. **Author `src/persistence/sqlite/index.ts`** — barrel: `{ db, getDb, getDbAsync, bootstrap }`.
    - Files: `src/persistence/sqlite/index.ts`
    - Acceptance: `import { db } from '@/persistence/sqlite'` resolves; type-only types also exported (`Match`, `NewMatch`, etc.).

### Build script

13. **Author `scripts/build-game-db.mjs`** — better-sqlite3 in-memory DB, apply all `drizzle/*.sql`, set PRAGMA user_version, optionally seed reference data, serialise to `public/game.db`. Also write `public/game-db.meta.json` with `{ user_version: N, generated_at: ... }`.
    - Files: `scripts/build-game-db.mjs`
    - Acceptance: deterministic output (same migrations → byte-identical `game.db`); meta file references the same version as the DB.

14. **Wire as `prebuild` / `predev` / `pretest:browser`.** Update `package.json` scripts.
    - Files: `package.json`
    - Acceptance: `pnpm dev`, `pnpm build`, `pnpm test:browser` all run `build-game-db` first.

15. **Gitignore `public/game.db` + `public/game-db.meta.json`.**
    - Files: `.gitignore`
    - Acceptance: artefacts not committed.

### Repos

16. **Author `src/store/repos/{matches,moves,aiStates,analytics,index}.ts`.** Typed CRUD per `docs/DB.md`. Each repo function takes the drizzle handle as first arg.
    - Files: as listed
    - Acceptance: every function from `docs/DB.md` "Repos" section is exported. Types match drizzle's inferred row types.

17. **Repo CRUD tests.** For each repo, exercise create/read/update/delete + the relevant compound operations (`forfeit`, `setChain`, `clearChain`, `appendMove`, `upsertDump`, `upsertAggregate`, `listByFamily`).
    - Files: `src/store/repos/__tests__/{matches,moves,aiStates,analytics}.test.ts`
    - Acceptance: each test backed by `makeTestDb`; transactions tested for rollback behaviour; analytics-refresh test verifies materialised value updates idempotently.

### Bootstrap browser test

18. **Browser-tier bootstrap smoke test.** Create OPFS state, run bootstrap on first-run path; clear OPFS, run bootstrap again as second-run path; bump version, run bootstrap as drift-detected replay.
    - Files: `src/persistence/sqlite/__tests__/bootstrap.browser.test.ts`
    - Acceptance: all three paths pass against real capacitor-sqlite + real OPFS in browser tier.

### CI gate

19. **Add `pnpm drizzle-kit check` to CI** — verifies committed migrations match the current schema. Add to `core` job.
    - Files: `.github/workflows/ci.yml`
    - Acceptance: schema drift fails CI.

### PR mechanics

20. **Resolve outstanding CodeRabbit + Gemini threads on PR #5.** The earlier-round threads about `as never` casts, transaction deadlock, jeep registration recovery, kv contract are mostly obsoleted by the rewrite (the entire `src/persistence/db/` was deleted and replaced by the drizzle pipeline). Reply to each thread with the specific commit SHA where the concern is addressed (or where the concerned code was removed).
    - Files: GraphQL mutations only
    - Acceptance: zero unresolved threads.

21. **Squash-merge PR #5.** Conventional-commits message: `feat(persistence,db): ship preferences kv + drizzle-backed sqlite with build-time game.db and runtime version-replay`.
    - Acceptance: merged to main; branch deleted; directive's PRQ-1 marked `[x]`.

## Execution order

```
1, 2 (drizzle deps + config in parallel)
   ↓
3 (schema files)
   ↓
4 (drizzle generate)
   ↓
5 (test-db factory)
   ↓
6, 7 (schema + migration tests in parallel)
   ↓
8 (jeep-web)
   ↓
9 (client.ts) ─────┐
10 (version.ts) ───┤
                   ↓
11 (bootstrap.ts)
   ↓
12 (sqlite barrel)
   ↓
13, 14, 15 (build script + script wires + gitignore in parallel)
   ↓
16 (repos)
   ↓
17 (repo tests)
   ↓
18 (browser bootstrap test)
   ↓
19 (CI gate)
   ↓
20, 21 (PR thread cleanup + squash-merge)
```

Strict TDD: each test file (5, 6, 7, 17, 18) lands and is verified red before its corresponding implementation begins.

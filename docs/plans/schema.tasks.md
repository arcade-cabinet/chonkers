# Batch: chonkers-schema

**Created:** 2026-04-29
**Config:** stop_on_failure=true, auto_commit=true, reviewer_dispatch=parallel-background-per-commit
**PRD:** [schema.prq.md](./schema.prq.md)
**Prerequisite:** persistence.prq.md merged

## Tasks

1.  [P1] **Author docs/SCHEMA.md** — Migration runner contract; chonkers schema reference; forward-only policy.
    - Files: docs/SCHEMA.md
    - Criteria: 7 sections, chonkers reference includes column rationale linked to consumer

2.  [P1] **Author src/schema/chonkers/README.md** — Inline package notes.
    - Files: src/schema/chonkers/README.md
    - Criteria: forward-only reminder; one-line per migration

3.  [P2] **Author src/schema/__tests__/_setup.ts** — Browser-tier setup; unique DB per test.
    - Files: src/schema/__tests__/_setup.ts
    - Criteria: setup function exported; afterEach closes DB

4.  [P2] **Write src/schema/__tests__/runner.test.ts** — Generic runner against synthetic migration sets.
    - Files: src/schema/__tests__/runner.test.ts
    - Criteria: ≥6 assertions; covers empty/single/multi/error-rollback; concurrent runners don't double-apply

5.  [P3] **Implement src/schema/runner/types.ts** — Migration, MigrationResult.
    - Files: src/schema/runner/types.ts
    - Criteria: types exported

6.  [P3] **Implement src/schema/runner/versionTable.ts** — ensureVersionTable, getApplied, recordApplied.
    - Files: src/schema/runner/versionTable.ts
    - Criteria: all three exported

7.  [P3] **Implement src/schema/runner/applyPending.ts** — Main runner; per-migration transaction; UNIQUE-on-version concurrency safety.
    - Files: src/schema/runner/applyPending.ts
    - Criteria: task 4 tests pass; failure rolls back atomically

8.  [P3] **Author src/schema/runner/index.ts barrel** — Exports applyPending + types.
    - Files: src/schema/runner/index.ts
    - Criteria: barrel resolves; types exported

9.  [P4] **Write src/schema/__tests__/chonkers-migrations.test.ts** — Apply chonkers manifest, assert tables/columns/indexes/foreign-keys via PRAGMA.
    - Files: src/schema/__tests__/chonkers-migrations.test.ts
    - Criteria: ≥6 assertions; foreign-key cascade verified

10. [P4] **Write src/schema/__tests__/chonkers-idempotency.test.ts** — Apply twice, second is no-op.
    - Files: src/schema/__tests__/chonkers-idempotency.test.ts
    - Criteria: second call returns appliedNow=[], skipped=[all]; row counts unchanged

11. [P4] **Implement src/schema/chonkers/001-matches.sql** — matches table.
    - Files: src/schema/chonkers/001-matches.sql
    - Criteria: matches column inventory matches docs/SCHEMA.md

12. [P4] **Implement src/schema/chonkers/002-moves.sql** — moves table with FK.
    - Files: src/schema/chonkers/002-moves.sql
    - Criteria: PRIMARY KEY (match_id, move_index); ON DELETE CASCADE

13. [P4] **Implement src/schema/chonkers/003-decision-traces.sql** — decision_traces table with FK.
    - Files: src/schema/chonkers/003-decision-traces.sql
    - Criteria: PRIMARY KEY (match_id, move_index); ON DELETE CASCADE

14. [P4] **Implement src/schema/chonkers/004-indexes.sql** — Three indexes.
    - Files: src/schema/chonkers/004-indexes.sql
    - Criteria: idx_matches_ended_at, idx_matches_difficulty_disposition, idx_moves_match_side all created

15. [P4] **Implement src/schema/chonkers/005-ai-snapshot.sql** — Adds ai_snapshot_json TEXT column to matches.
    - Files: src/schema/chonkers/005-ai-snapshot.sql
    - Criteria: ALTER TABLE matches ADD COLUMN ai_snapshot_json TEXT

16. [P4] **Implement src/schema/chonkers/manifest.ts** — Vite ?raw imports; CHONKERS_MIGRATIONS ordered array.
    - Files: src/schema/chonkers/manifest.ts
    - Criteria: tasks 9 + 10 tests pass; ?raw imports resolve in browser-tier vitest

17. [P4] **Implement src/schema/bootstrap.ts** — bootstrapChonkersSchema(name, version=1) returns { connection, appliedNow, skipped }.
    - Files: src/schema/bootstrap.ts
    - Criteria: end-to-end test creates fresh DB, applies all migrations, returns ready connection

18. [P4] **Author src/schema/index.ts top-level barrel** — Exports applyPending, bootstrapChonkersSchema, CHONKERS_MIGRATIONS, types.
    - Files: src/schema/index.ts
    - Criteria: all test imports resolve

19. [P5] **Run full schema test suite** — pnpm test:browser src/schema 100% pass, ≤15s, 5 clean consecutive runs.
    - Files: none
    - Criteria: 100% pass; ≤15s; no flake

20. [P5] **Add forward-only enforcement** — CI check that fails PRs modifying existing migration files.
    - Files: .github/workflows/forward-only-migrations.yml (or equivalent)
    - Criteria: CI fails on edit of existing .sql; CI passes on new file added

## Execution Order

```
1, 2 (docs in parallel)
   ↓
3 (test setup)
   ↓
4 (runner tests after 3)
   ↓
5, 6 (types + versionTable in parallel after 4)
   ↓
7 (applyPending after 5+6)
   ↓
8 (runner barrel)
   ↓
9, 10 (chonkers tests can author against future manifest path)
11, 12, 13, 14, 15 (SQL files in parallel)
   ↓
16 (manifest after SQL files exist)
   ↓
17 (bootstrap after 16)
   ↓
18 (top barrel)
   ↓
19, 20 (verification + CI rule)
```

## Configuration

```yaml
batch_name: chonkers-schema
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1
```

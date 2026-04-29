# PRD: src/schema — forward-only migration runner + chonkers SQL files

**Created:** 2026-04-29
**Status:** ACTIVE
**Owner:** jbogaty
**Acceptance:** A migration package that applies forward-only SQL migrations against a `db` connection from `src/persistence/`, with the chonkers-specific migration set committed and tested. Idempotent on re-init; failures roll back atomically; ordered application across all backends.

**Prerequisite:** [persistence.prq.md](./persistence.prq.md) must be complete and merged. This PRD consumes `db` from `src/persistence/` as an installed dependency.

---

## Why this is its own PRD

Migrations are bootstrap logic, not transport. The persistence package stays generic by not knowing what tables exist. A migration runner answers a different question: **"is this DB at the expected schema version, and if not, how do I bring it up to date?"**

Decoupling migrations from persistence yields:

- **Persistence is truly transport.** No schema awareness, fully portable.
- **Schema is its own versioned artifact.** Migrations are the canonical record of "what changed, when, why" — analogous to git for the DB shape.
- **Multi-game reuse.** The `runner` is generic; the `chonkers/*.sql` directory is project-specific. Future arcade-cabinet games vendor the runner and supply their own `*/`.
- **Testability.** Migration application is testable in isolation against fresh DBs without going through the game's actual data flow.

---

## Goal

Land `src/schema/` as a generic migration runner (portable across projects) plus a chonkers-specific migration set (`src/schema/chonkers/*.sql`). The runner reads `.sql` files in lexicographic order, applies pending ones inside a transaction, records applied versions in a `_schema_versions` table, and is idempotent on re-init.

The chonkers migration set covers everything the logic packages need:

- `matches` table (match metadata + AI configuration + winner + end reason)
- `moves` table (per-move action JSON + applied timestamp)
- `decision_traces` table (optional per-move AI decision dumps)
- `ai_snapshot_json` column on `matches` (sim coordinator routes AI's `dumpAiState` output here)
- Indexes for analytics-friendly query patterns

Every column shape is justified by a downstream consumer in the chonkers logic PRDs. No speculative columns.

---

## Architecture

### Generic runner

```
src/schema/
├── runner/
│   ├── types.ts                  # Migration, MigrationFile, MigrationResult
│   ├── readMigrations.ts         # readMigrations(dirPath): MigrationFile[] sorted by filename
│   ├── applyPending.ts           # applyPending(connection, migrations): MigrationResult
│   ├── versionTable.ts           # ensureVersionTable(connection); getApplied(connection); recordApplied(connection, version)
│   └── index.ts                  # barrel for runner
├── chonkers/
│   ├── 001-matches.sql
│   ├── 002-moves.sql
│   ├── 003-decision-traces.sql
│   ├── 004-indexes.sql
│   ├── 005-ai-snapshot.sql       # adds ai_snapshot_json column to matches
│   ├── manifest.ts               # exports the ordered list of SQL contents (so build bundles them)
│   └── README.md                 # forward-only policy; how to add a new migration
├── bootstrap.ts                  # bootstrapChonkersSchema(connection): applies the chonkers manifest
├── index.ts                      # barrel: { applyPending, bootstrapChonkersSchema }
└── __tests__/
    ├── _setup.ts                 # browser-tier vitest setup (mirrors persistence test setup)
    ├── runner.test.ts            # generic runner against synthetic .sql sets
    ├── chonkers-migrations.test.ts  # apply chonkers manifest, assert tables exist + columns correct
    └── chonkers-idempotency.test.ts # apply twice; second time is a no-op
```

### Migration file format

Plain SQL files, one migration per file, named `NNN-short-name.sql` where NNN is a zero-padded ordinal. Forward-only: file content never edited after merge; new changes mean new files. Each file contains all DDL/DML for one logical change, wrapped implicitly in the transaction the runner provides.

Filename convention is the version identifier. The runner sorts lexicographically and applies any whose name isn't yet in `_schema_versions`.

```sql
-- src/schema/chonkers/001-matches.sql
CREATE TABLE IF NOT EXISTS matches (
  id              TEXT PRIMARY KEY,
  first_player    TEXT NOT NULL,
  ai_difficulty   TEXT NOT NULL,
  ai_disposition  TEXT NOT NULL,
  player_color    TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  winner          TEXT,
  end_reason      TEXT
);
```

```sql
-- src/schema/chonkers/002-moves.sql
CREATE TABLE IF NOT EXISTS moves (
  match_id        TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  move_index      INTEGER NOT NULL,
  side            TEXT NOT NULL,
  action_json     TEXT NOT NULL,
  applied_at      TEXT NOT NULL,
  PRIMARY KEY (match_id, move_index)
);
```

```sql
-- src/schema/chonkers/003-decision-traces.sql
CREATE TABLE IF NOT EXISTS decision_traces (
  match_id        TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  move_index      INTEGER NOT NULL,
  trace_json      TEXT NOT NULL,
  PRIMARY KEY (match_id, move_index)
);
```

```sql
-- src/schema/chonkers/004-indexes.sql
CREATE INDEX IF NOT EXISTS idx_matches_ended_at
  ON matches(ended_at);

CREATE INDEX IF NOT EXISTS idx_matches_difficulty_disposition
  ON matches(ai_difficulty, ai_disposition);

CREATE INDEX IF NOT EXISTS idx_moves_match_side
  ON moves(match_id, side);
```

```sql
-- src/schema/chonkers/005-ai-snapshot.sql
ALTER TABLE matches ADD COLUMN ai_snapshot_json TEXT;
```

`manifest.ts` is the bundled list. SQL files are imported as text via Vite's `?raw` import:

```ts
// src/schema/chonkers/manifest.ts
import m001 from './001-matches.sql?raw';
import m002 from './002-moves.sql?raw';
import m003 from './003-decision-traces.sql?raw';
import m004 from './004-indexes.sql?raw';
import m005 from './005-ai-snapshot.sql?raw';

export const CHONKERS_MIGRATIONS = [
  { version: '001-matches',          sql: m001 },
  { version: '002-moves',            sql: m002 },
  { version: '003-decision-traces',  sql: m003 },
  { version: '004-indexes',          sql: m004 },
  { version: '005-ai-snapshot',      sql: m005 },
] as const;
```

This compiles into the bundle directly — no filesystem access at runtime, works on web + native + tests identically.

### Version table

The runner maintains a `_schema_versions` table (underscore prefix to signal internal):

```sql
CREATE TABLE IF NOT EXISTS _schema_versions (
  version       TEXT PRIMARY KEY,
  applied_at    TEXT NOT NULL
);
```

`applyPending(connection, migrations)`:

1. `ensureVersionTable(connection)` — idempotent CREATE.
2. `getApplied(connection)` — `SELECT version FROM _schema_versions`.
3. For each migration not in applied set, in order:
   - `connection.transaction(async (tx) => { await tx.exec(sql); await tx.exec("INSERT INTO _schema_versions (version, applied_at) VALUES (?, ?)", [version, now]); })`.
   - If the transaction throws, the migration is rolled back atomically. The runner stops and re-throws — partial state is impossible.
4. Returns `{ appliedNow: string[], skipped: string[] }`.

Idempotent on re-init: applied migrations are skipped. Concurrent re-init is safe because the inner `INSERT` into `_schema_versions` is part of the same transaction; two concurrent runners attempting the same version produce one success and one rollback (UNIQUE constraint violation), and the loser sees the version as applied on its next read.

### Bootstrap entry point

```ts
// src/schema/bootstrap.ts
import { db } from '@/persistence';
import { applyPending } from './runner';
import { CHONKERS_MIGRATIONS } from './chonkers/manifest';

export async function bootstrapChonkersSchema(name: string, version: number = 1) {
  const connection = await db.connect(name, version);
  const result = await applyPending(connection, CHONKERS_MIGRATIONS);
  return { connection, ...result };
}
```

This is the entry point sim's bootstrap calls. Handles connect + apply in one call, returns the ready-to-use connection plus the migration result for telemetry.

---

## Documentation

### `docs/SCHEMA.md` (new doc)

Sections:

- **Overview** — what the package is, what it isn't (not transport, not typed access).
- **Migration file format** — naming convention, content rules, forward-only policy.
- **Runner** — `applyPending` semantics, transaction guarantees, version table.
- **Adding a migration** — step-by-step: create file, add to manifest, add a test asserting the new shape, never edit existing files.
- **Chonkers schema reference** — full table definitions with column-by-column rationale.
- **Version table** — what's stored, why, recovery procedure if it gets corrupted.
- **Portability** — how to vendor the runner into another project (copy `src/schema/runner/`, supply your own migration set).

### `src/schema/chonkers/README.md`

Inline notes for chonkers' migration set. One-line description per file. Forward-only policy reminder.

---

## Tasks

### A. Documentation

#### A1. Author `docs/SCHEMA.md`

**Files:** `docs/SCHEMA.md`

**Acceptance criteria:**
- Frontmatter present
- All seven sections complete with examples
- Chonkers schema reference includes every column with rationale linking to the consumer (sim, store, AI snapshot, etc.)
- Forward-only policy stated explicitly with consequences

#### A2. Author `src/schema/chonkers/README.md`

**Files:** `src/schema/chonkers/README.md`

**Acceptance criteria:**
- Frontmatter present
- One-line description per migration file
- Forward-only reminder

---

### B. Tests written first

#### B1. Author `src/schema/__tests__/_setup.ts`

**Description:** Browser-tier vitest setup. Allocates unique DB name per test via `crypto.randomUUID()`. Calls `db.close` in afterEach.

**Files:** `src/schema/__tests__/_setup.ts`

**Acceptance criteria:**
- Setup function exported
- Each test gets a unique DB
- afterEach cleanup runs

#### B2. Write `src/schema/__tests__/runner.test.ts`

**Description:** Generic runner tests. Uses synthetic migration sets (constructed inline in the test) against fresh DBs. Asserts: `_schema_versions` table created on first init; pending migrations applied in order; already-applied migrations skipped; failure inside a migration rolls back atomically; concurrent runners don't double-apply.

**Files:** `src/schema/__tests__/runner.test.ts`

**Acceptance criteria:**
- ≥6 distinct assertions
- Synthetic migration sets exercise: empty set, single migration, multi-migration, migration that throws (assert rollback)
- Concurrent runner test launches two `applyPending` calls in parallel against the same DB; asserts each migration is applied exactly once

#### B3. Write `src/schema/__tests__/chonkers-migrations.test.ts`

**Description:** Apply the full chonkers manifest to a fresh DB; assert tables exist with expected columns; assert indexes are created; assert foreign keys enforced (insert a move with a nonexistent match_id, assert error).

**Files:** `src/schema/__tests__/chonkers-migrations.test.ts`

**Acceptance criteria:**
- ≥6 assertions
- All five chonkers tables/columns/indexes verified via `PRAGMA table_info` and `PRAGMA index_list` queries
- Foreign-key cascade verified end-to-end (insert match, insert moves, delete match, assert moves gone)

#### B4. Write `src/schema/__tests__/chonkers-idempotency.test.ts`

**Description:** Apply chonkers manifest twice. Second call is a no-op (`appliedNow` is empty; `skipped` contains all five). DB state unchanged.

**Files:** `src/schema/__tests__/chonkers-idempotency.test.ts`

**Acceptance criteria:**
- Second call returns `{ appliedNow: [], skipped: ['001-matches', ..., '005-ai-snapshot'] }`
- DB row counts unchanged across the two calls

---

### C. Implementation

#### C1. Implement `src/schema/runner/types.ts`

**Description:** `Migration { version: string; sql: string }`, `MigrationResult { appliedNow: string[]; skipped: string[] }`.

**Files:** `src/schema/runner/types.ts`

**Acceptance criteria:**
- Types exported

#### C2. Implement `src/schema/runner/versionTable.ts`

**Description:** `ensureVersionTable(connection)`, `getApplied(connection)`, `recordApplied(tx, version)`.

**Files:** `src/schema/runner/versionTable.ts`

**Acceptance criteria:**
- All three exported
- Used by `applyPending`

#### C3. Implement `src/schema/runner/applyPending.ts`

**Description:** Main runner. Skip-on-applied; per-migration transaction; concurrent safety via UNIQUE constraint on version PK.

**Files:** `src/schema/runner/applyPending.ts`

**Acceptance criteria:**
- B2 tests pass
- Each migration runs inside a single transaction
- Failure in a migration rolls back atomically and re-throws
- Returns `{ appliedNow, skipped }`

#### C4. Author `src/schema/runner/index.ts` barrel

**Files:** `src/schema/runner/index.ts`

**Acceptance criteria:**
- Exports `applyPending` and types

#### C5. Implement `src/schema/chonkers/*.sql` (five files)

**Files:** `src/schema/chonkers/{001-matches,002-moves,003-decision-traces,004-indexes,005-ai-snapshot}.sql`

**Acceptance criteria:**
- All five files present with the SQL from the architecture section
- Each file's SQL is valid against SQLite

#### C6. Implement `src/schema/chonkers/manifest.ts`

**Description:** Imports each `.sql` file via Vite's `?raw` modifier; exports `CHONKERS_MIGRATIONS` as an ordered array.

**Files:** `src/schema/chonkers/manifest.ts`

**Acceptance criteria:**
- B3 + B4 tests pass
- Vite `?raw` imports resolve in browser-tier vitest

#### C7. Implement `src/schema/bootstrap.ts`

**Description:** `bootstrapChonkersSchema(name, version=1)`. Calls `db.connect`, applies `CHONKERS_MIGRATIONS`, returns `{ connection, appliedNow, skipped }`.

**Files:** `src/schema/bootstrap.ts`

**Acceptance criteria:**
- Used by sim's bootstrap (consumer in chonkers-logic PRD)
- Returns the ready-to-use connection

#### C8. Author `src/schema/index.ts` top-level barrel

**Files:** `src/schema/index.ts`

**Acceptance criteria:**
- Exports `applyPending`, `bootstrapChonkersSchema`, `CHONKERS_MIGRATIONS`, types
- All test imports resolve

---

### D. Verification

#### D1. Full test suite green

**Files:** none — process step

**Acceptance criteria:**
- `pnpm test:browser src/schema` 100% pass
- ≤15s runtime
- 5 consecutive clean runs

#### D2. Forward-only enforcement

**Description:** Add a CI check (or biome rule, or simple test) that asserts no existing `.sql` file in `src/schema/chonkers/` has been edited since merge. The check is: `git diff main -- src/schema/chonkers/*.sql` must show only new files, never modifications.

**Files:** `.github/workflows/forward-only-migrations.yml` (or equivalent biome rule / pre-commit hook)

**Acceptance criteria:**
- CI fails when a PR modifies an existing migration file
- CI passes when a PR adds a new migration file

---

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

---

## Execution order

```
A1, A2 (docs in parallel; no code deps)
   ↓
B1 (test setup)
   ↓
B2 (runner tests after B1)
   ↓
C1, C2 (types + versionTable in parallel after B2)
   ↓
C3 (applyPending after C1 + C2)
   ↓
C4 (runner barrel)
   ↓
B3, B4 (chonkers tests in parallel; can author before manifest exists since they import the manifest path)
   ↓
C5, C6 (SQL files + manifest)
   ↓
C7 (bootstrap)
   ↓
C8 (top barrel)
   ↓
D1, D2 (verification)
```

---

## Risks

- **Vite `?raw` imports in test environment.** `@vitest/browser` should support `?raw` natively (Vite-powered). If not, fallback is to embed SQL as a string literal in `manifest.ts` (less readable, but works). Verify early.
- **SQLite `ALTER TABLE ADD COLUMN` semantics.** The 005 migration adds a nullable column — safe across all SQLite versions. If a future migration needs to drop or rename columns, SQLite requires the table-rebuild dance (CREATE NEW TABLE → INSERT SELECT → DROP OLD → RENAME). Document this in `docs/SCHEMA.md`.
- **Foreign keys must be enabled.** The connection layer (in persistence) must `PRAGMA foreign_keys = ON;` before queries; otherwise our cascades silently no-op. Add this to `db/connection.ts` in persistence (it's a one-line addition that doesn't violate persistence's "no schema knowledge" rule — it's a connection-level pragma, not a table-level concern). If persistence is already merged, this needs a forward-amendment.

---

## Definition of Done

- All A* documentation tasks merged.
- All B* tests merged and demonstrated red.
- All C* implementations merged.
- D1 verification: full suite green.
- D2 forward-only enforcement merged.
- `pnpm typecheck && pnpm lint && pnpm test:browser src/schema && pnpm build` clean.
- The runner (`src/schema/runner/`) is provably portable: zero `@/...` imports outside its own boundary except `@/persistence` (which is its only allowed dependency).
- Chonkers manifest is callable end-to-end via `bootstrapChonkersSchema('chonkers-test-X', 1)`.

After this PRD merges, downstream PRDs (logic) consume `bootstrapChonkersSchema` from `@/schema` to set up their connection.

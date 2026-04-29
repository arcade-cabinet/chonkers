# PRD: persistence + db (`src/persistence/{preferences,sqlite}/`, `src/store/`)

**Created:** 2026-04-29
**Status:** ACTIVE
**Owner:** jbogaty
**Branch:** `prd/persistence`
**PR:** #5

This PRD merges what was originally two separate slices ("persistence" — typed storage transport; "schema" — migration runner). They became one PRD because:

- The runtime SQLite path uses **drizzle ORM + `@capacitor-community/sqlite`** with a **build-time `public/game.db`** asset and a **runtime version-replay** of drizzle-kit-generated migrations. There is no separate "schema runner" — drizzle owns schema, drizzle-kit owns migrations, capacitor-sqlite owns runtime.
- Splitting these into two PRDs forced inventing seams that don't exist in the actual implementation. One PR keeps the architectural decisions in one place.

The full architecture is documented in `docs/PERSISTENCE.md` (the kv side) and `docs/DB.md` (the SQL side). This PRD is the **task list** for landing it.

---

## Goal

Land:

1. **`src/persistence/preferences/`** — typed JSON kv over `@capacitor/preferences`. ✅ already shipped (kv.ts + browser-tier tests, all 13 passing).
2. **`src/persistence/sqlite/`** — drizzle-orm wired to `@capacitor-community/sqlite` at runtime, with first-run import of `public/game.db` and subsequent-run version-replay against persisted user copies.
3. **`src/store/`** — typed CRUD repos over the drizzle handle: `matchesRepo`, `movesRepo`, `aiStatesRepo`, `analyticsRepo`. Each repo takes the drizzle handle as first arg so callers can compose them inside transactions.
4. **`scripts/build-game-db.mjs`** — Node-time build script using `better-sqlite3`, applying every committed migration in order, setting `PRAGMA user_version`, and serialising the result to `public/game.db`. Wired as `prebuild` / `predev` / `pretest:browser`.
5. **`drizzle/`** — drizzle-kit-generated migration SQL files committed to git. Initial migration `drizzle/0000_initial.sql` creates `matches`, `moves`, `ai_states`, `analytics_aggregates` per `docs/DB.md`.
6. **`src/persistence/sqlite/__tests__/`** — Tier 1 (Node, `better-sqlite3` via `makeTestDb`) covers schema correctness, migration replay, repo CRUD, transaction semantics. Tier 2 (browser, real capacitor-sqlite + OPFS) covers ONLY the bootstrap-and-replay path.

The entire game's persisted-state pipeline lands in one PR. Subsequent PRDs (logic-surfaces-and-broker, etc.) consume `src/persistence/preferences`, `src/persistence/sqlite`, and `src/store/*` as already-shipped dependencies.

---

## Architecture

The full design lives in `docs/DB.md` (build-time vs test-time vs runtime, version-replay flow, table catalogue, repo organisation, test-tier strategy) and `docs/PERSISTENCE.md` (kv contract). This PRD doesn't re-document them; it just enumerates the work.

Key decisions captured in those docs:

- **Three SQLite execution contexts share one schema and one migration ladder:**
  - Build time → `better-sqlite3` produces `public/game.db`.
  - Test time → `better-sqlite3` via `makeTestDb()` (in-memory by default, on-disk under `CHONKERS_TEST_DB_DIR` for diagnostics).
  - User runtime → `@capacitor-community/sqlite` imports the asset and replays missing migrations forward.
- **`PRAGMA user_version`** is the version source. Built `game.db` ships its expected version in a sibling `game-db.meta.json` so the runtime never deserialises the asset just to read the version.
- **Forward-only migrations.** No `down()`. Migrations commit to git and never get edited after shipping.
- **No mocks.** Every test exercises real SQL against real SQLite.
- **`drizzle-kit check` runs in CI** to prevent schema-drift between TS schema and committed migrations.

---

## Tasks

See `persistence-and-db.tasks.md` for the per-task acceptance checklist.

---

## Acceptance criteria

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- `pnpm test:node` covers schema correctness, migration forward-replay, every repo's CRUD, transaction semantics. All green.
- `pnpm test:browser` covers kv (13 tests) + sqlite bootstrap-and-replay smoke. All green.
- `pnpm build` produces a clean `dist/` and a deterministic `public/game.db`.
- `pnpm drizzle-kit check` clean (no schema drift between TS and committed SQL).
- `public/game.db` is gitignored (it's a build artefact).
- `drizzle/0000_initial.sql` is committed to git.
- All CodeRabbit + Gemini review threads on PR #5 resolved.
- One squash-merge with a `feat(persistence,db): ` conventional-commits message.

After merge, the PR closes and the directive's PRQ-1 entry is marked `[x]`. The next PRQ (logic-surfaces-and-broker) becomes the active branch.

---

## Risks

- **Drizzle + capacitor-sqlite adapter.** drizzle-orm doesn't ship a first-class capacitor-sqlite driver; the integration uses drizzle's `sqlite-proxy` driver pointed at `@capacitor-community/sqlite`'s `execute`/`query`/`run` methods. The proxy adapter is small (~50 lines) but is the most novel piece of code in this PRD. Mitigation: small, well-tested, modelled after sibling-project patterns.
- **`better-sqlite3` Node-tier dep.** Native module; needs platform builds. Mitigation: pinned version known to work on macOS arm64 + Linux x64 CI.
- **OPFS quota in browser tests.** Tier 2 tests with unique DB names accumulate OPFS entries. Mitigation: bootstrap test uses a single fixed DB name and clears it on setup.
- **Migration replay + open transaction.** If migration `N` fails midway through replay, the user's persisted DB must remain at version `N-1` (not half-migrated). Mitigation: replay runs inside an outer transaction that rolls back on any migration error.

---

## Definition of Done

- All canonical docs aligned: `docs/PERSISTENCE.md`, `docs/DB.md`, `docs/AI.md`, `docs/TESTING.md`, `docs/STATE.md`, `docs/ARCHITECTURE.md`. ✅
- `src/persistence/preferences/` shipped with browser-tier tests passing. ✅
- `src/persistence/sqlite/` shipped with Node-tier + thin browser-tier tests passing.
- `src/store/repos/` shipped with Node-tier tests passing.
- `scripts/build-game-db.mjs` produces `public/game.db` deterministically.
- `drizzle/` migration ladder committed.
- PR #5 squash-merged.

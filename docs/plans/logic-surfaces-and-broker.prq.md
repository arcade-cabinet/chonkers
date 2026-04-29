# PRD: Chonkers Logic Surfaces + Broker Demonstration

**Created:** 2026-04-29
**Status:** ACTIVE
**Owner:** jbogaty
**Acceptance:** ≥100 full chonkers matches driven through `src/sim/actions.ts` (the broker), each completing legally end-to-end with real engine, real AI, and real persistence — no mocks anywhere in the call graph.

**Prerequisites (both must be complete and merged before this PRD begins):**
- [persistence.prq.md](./persistence.prq.md) — `src/persistence/` provides generic `kv` + raw-SQL `db` transport. This PRD consumes it as an installed dependency.
- [schema.prq.md](./schema.prq.md) — `src/schema/` provides the migration runner + chonkers SQL files. This PRD consumes `bootstrapChonkersSchema` from `@/schema` to set up the connection.

This PRD does not build either of those packages; it only consumes them.

---

## Goal

Land the complete logic implementation of chonkers:

- `src/engine/` — pure rules engine.
- `src/ai/` — deterministic adversarial-search deciders, including a `dumpAiState` / `loadAiState` public API for save/resume.
- `src/store/` — typed data-access layer over the chonkers schema tables (matches, moves, traces). Reads `db.query<T>` from persistence; encodes chonkers types.
- `src/analytics/` — pre-baked aggregate queries (also via `db.query`).
- `src/sim/` — koota state layer + the actions broker, which **routes** save/resume between AI's public API and persistence's transport.

No visual wiring. Validation is the broker test demonstrating ≥100 full matches with aggregate properties asserted via real SQL queries against the persistence DB, plus a mid-match save/resume subset proving the routing contract.

The broker test is the integration test. By forbidding mocks at every layer, the natural dependency chain (engine → ai → persistence [done] → schema [done] → store → analytics → sim) **forces real composition**: a passing 100-game test means engine produces correct states, AI consumes them and returns legal actions plus serializable snapshots, store records everything via real SQL, analytics queries the resulting DB, and sim orchestrates the lifecycle (including save/resume) without leaks.

The save/resume subtest is critical because it proves the **layered ownership** of save/load is correct:
- **AI owns the shape** — `dumpAiState(history): AiSnapshot` and `loadAiState(snapshot): HistoryGraph` are the AI's public API; only the AI knows how to serialize its mental map without losing fidelity.
- **Persistence owns the transport** — `db.exec(sql, params)` writes the snapshot JSON; `db.query` reads it back. Persistence has no idea what's in the blob.
- **Sim owns the routing** — `saveMatchProgress(matchId)` reads `dumpAiState`'s output and routes it to `db.exec`; `resumeMatch(matchId)` reads `db.query`'s row and routes it to `loadAiState`. Sim is the only layer that touches both APIs in one function.

There is no separate "integration" task because the broker test IS the integration assertion.

---

## Dependency order (TDD lands in this order, no exceptions)

0. **Persistence prerequisite** — `src/persistence/` merged via [persistence.prq.md](./persistence.prq.md).
0a. **Schema prerequisite** — `src/schema/` merged via [schema.prq.md](./schema.prq.md).
1. **Documentation foundation** (no code dependencies) — contracts published before tests are written.
2. **Repo layout migration** — `src/` vs `app/` split; vite/vitest/biome configs aligned.
3. **`src/engine/`** — pure rules. Property tests against the barrel before any implementation.
4. **`src/ai/`** — adversarial-search deciders + `dumpAiState`/`loadAiState`. Tests use **real engine**, no mocks.
5. **`src/store/`** — typed data-access for chonkers tables. Tests use **real persistence + real schema**, no mocks.
6. **`src/analytics/`** — pre-baked aggregate queries. Tests use **real store + persistence + schema**, no mocks.
7. **`src/sim/`** — koota state + actions broker (including save/resume coordinator). Tests use **real everything below**.
8. **Broker demonstration** — 100-game test plus mid-match save/resume subset.
9. **Deps + repo health** — gates.json, CLAUDE.md, `.agent-state/directive.md`.

Each layer's tests must pass before the next layer begins. The no-mocks discipline: the only way to test layer N is to wire it up against the real layer N-1.

---

## Tasks

### Group A — Documentation foundation

#### A1. Author root agentic docs: `CLAUDE.md`, `AGENTS.md`, `STANDARDS.md`

**Description:** Per-repo agentic configuration. `CLAUDE.md` references global profiles via the `init-profile` skill (arcade-game + mobile-android + standard-repo profile addendums) plus chonkers-specific repo facts. `AGENTS.md` extends CLAUDE.md with Codex-targeted protocols. `STANDARDS.md` lays out non-negotiable code-quality rules — file size soft cap, conventional commits, no `Math.random()` outside permitted scopes, no React in `src/`, no engine imports from ai/sim, etc.

**Files:** `CLAUDE.md`, `AGENTS.md`, `STANDARDS.md`

**Acceptance criteria:**
- `CLAUDE.md` exists at repo root with `<!-- profile: arcade-game + mobile-android + standard-repo v1 -->` marker
- `CLAUDE.md` includes `@/Users/jbogaty/.claude/profiles/arcade-game.md`, `@.../mobile-android.md`, `@.../standard-repo.md` references
- `CLAUDE.md` documents the actual run/test/build/lint commands for the repo (verified by running them)
- `AGENTS.md` exists; covers the autonomy doctrine (continuous work, one PR per topic, per-commit reviewer dispatch, no `--no-verify`)
- `STANDARDS.md` exists; explicit rules with `Why:` and `How to apply:` per rule
- All three docs use the standard frontmatter (title, updated, status, domain)

#### A2. Rewrite `README.md`

**Description:** Replace the existing scaffold-style README with a true project README: tagline, what chonkers is, current implementation status pointer, quick-start commands (verified), tech-stack table, project layout, links to all doc pillars, license.

**Files:** `README.md`

**Acceptance criteria:**
- README opens with the locked tagline "Stack. Don't capture."
- README's "Quick start" commands all execute cleanly (`pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test:node`, `pnpm build`)
- README's project-layout section accurately reflects `src/` and `app/` post-migration
- README links every doc pillar (`docs/RULES.md`, `docs/AI.md`, `docs/SIM.md`, `docs/ARCHITECTURE.md`, `docs/PROPERTIES.md`, `docs/TESTING.md`, `docs/STATE.md`, `docs/LORE.md`, `docs/DESIGN.md`)

#### A3. Revise `docs/RULES.md` — coin-flip first-mover, win-check timing, 3D representation, multi-run splits

**Description:** Update the existing RULES.md to reflect the architectural decisions. §3 documents coin-flip first-mover (one bit from `crypto.getRandomValues`, persisted to `matches.first_player`, never derived from a seed). §5 documents the multi-run-split commit shape with the contiguous-run partitioning algorithm and the chain-aborts-on-blocked-destination rule. §7 explicitly notes that the win check fires after each move resolves before turn flips (precluding simultaneous victory). State representation is documented as 3D occupancy `(col, row, h)`, not 2D-array-of-stacks.

**Files:** `docs/RULES.md`

**Acceptance criteria:**
- §3 specifies coin-flip first-mover from `crypto.getRandomValues`
- §5 specifies multi-run split partitioning: `{0,1,4}` of 6-stack → `[[0,1],[4]]`; `{0,2,5}` → `[[0,2],[5]]`; explicitly worked examples
- §5 specifies chain-abort-on-blocked behavior
- §7 explicitly states win check fires before turn flip; simultaneous victory is impossible by construction
- Document references position as `(col, row, h)` 3D occupancy throughout

#### A4. Author `docs/AI.md` — AI package contract

**Description:** New doc, sibling to RULES.md. Specifies the `Decide` signature, AiOptions, AiDifficulty (perception radius / memory depth / lookahead depth — three orthogonal knobs), Disposition (aggressive / balanced / defensive — weight bundles, force multipliers on the same feature set), DecisionTrace structure, determinism guarantee (same `(state, history, side, profile)` → byte-equal Action and trace; no PRNG anywhere), profile catalog (9 profiles = 3 difficulties × 3 dispositions). Documents the search algorithm (depth-limited alpha-beta minimax over Yuka Graph; transposition cache via Zobrist; rollouts unused since we minimax not MCTS).

**Files:** `docs/AI.md`

**Acceptance criteria:**
- Decide signature documented with full type signature
- All three difficulty knobs documented with their per-level values
- All three dispositions documented with their weight bundles (full table)
- DecisionTrace structure documented field-by-field
- Determinism contract stated as a falsifiable test specification
- 9 profiles enumerated explicitly
- Search algorithm documented (alpha-beta over Yuka Graph + Zobrist transposition)

#### A5. Author `docs/SIM.md` — sim/broker contract

**Description:** New doc. Specifies the koota world structure (singleton entities `Game` and `Match`; per-piece entities), the trait inventory (Position, Owner, IsSelected, etc.), and the action surface (`newMatch`, `continueMatch`, `dispatchPlayerAction`, `aiTakesTurn`, `setSelection`, `openSplitOverlay`, `closeSplitOverlay`, etc.). Documents the broker invariants — every action call leaves the world in a valid state; no partial mutations; `EngineState` trait is the canonical engine GameState mirror; `syncEngineToBoard` system reconciles per-piece traits.

**Files:** `docs/SIM.md`

**Acceptance criteria:**
- World structure documented (Game singleton, Match singleton, per-piece entities)
- All traits documented with their schemas
- All actions documented with signatures and pre/post-conditions
- Invariant: every action call returns the world to a consistent state — documented as a test specification
- Documents the dispatch flow: action → engine.stepAction → trait updates → audio role → persistence.appendMove

#### A6. Author `docs/PROPERTIES.md` — falsifiable engine + AI propositions

**Description:** New doc listing falsifiable claims that hold over many simulated matches with deterministic AI on both sides. Each proposition has threshold + rationale. Categories: termination, soundness, balance, mechanic engagement, state complexity, rule-variation hypotheses. These propositions become assertions in the 100-game broker test.

**Files:** `docs/PROPERTIES.md`

**Acceptance criteria:**
- Termination: 100% of seeds in [1, 100] complete in <200 turns
- Balance: first-mover win rate within [40%, 60%] across 100 matches with paired difficulty/disposition
- Soundness: every non-terminal state has ≥1 legal action (asserted across every state in every game)
- Engagement: chonks per game mean ≥ 4; max stack across 100 games ≥ 4
- Determinism: same `(firstPlayer, redConfig, whiteConfig)` → byte-equal sequence × 5 runs
- Each proposition tagged with the test file/function that asserts it

#### A7. Revise `docs/ARCHITECTURE.md`

**Description:** Update to reflect the final layout. Three pure logic packages (`src/engine/`, `src/ai/`, `src/persistence/`) + one runtime package (`src/sim/`). `app/` holds all React. Yuka used for Graph + Vector3 + BoundingSphere + BVH; not for MathUtils/NavMesh/steering/Wander. Koota is the only state library. localStorage is the dev/test persistence backend; Capacitor SQLite is deferred. No PRNG anywhere.

**Files:** `docs/ARCHITECTURE.md`

**Acceptance criteria:**
- Module-boundary table reflects final layout (no `src/render/`, no `src/ui/`, no `src/state/`, no `src/ecs/`, no `src/sim/` simulation harness)
- Dependency arrow documented: app → sim → {engine, ai, persistence}; engine and ai depend on nothing within `src/`; persistence depends on nothing within `src/` (type-imports only)
- Yuka usage scoped explicitly (Graph, Node, Edge, Vector3, BoundingSphere, BVH allowed; MathUtils/NavMesh/steering banned)
- Persistence dual-implementation (localStorage dev/test; SQLite production-future) documented
- "No PRNG" decision documented with rationale

#### A8. Revise `docs/STATE.md`

**Description:** Update STATE.md to reflect what's actually shipped after this PRD completes (engine, ai, sim with broker, docs). Mark prior tasks complete. Note that visual wiring is the next milestone.

**Files:** `docs/STATE.md`

**Acceptance criteria:**
- "What is done" section accurately reflects engine + ai + sim + persistence + docs
- "What is NOT yet done" section reflects only visual wiring + native shells + e2e
- Open questions list pruned to only-still-open items

#### A9. Author `docs/TESTING.md` revision

**Description:** Update existing TESTING.md to reflect: tier-1 (`src/**/__tests__/*.test.ts`, node) is fast-check property tests on each package's barrel + the 100-game broker test; tier-2 (browser via @vitest/browser) is for `app/` only and lands in a later milestone; tier-3 (Playwright e2e) is for `app/` + visual wiring; tier-4 (Maestro native smoke) is post-Capacitor.

**Files:** `docs/TESTING.md`

**Acceptance criteria:**
- Tier-1 description matches the actual test files we'll create
- Each test file listed with what it asserts
- Property-test approach documented (fast-check arbitraries per package)
- 100-game broker test documented as the integration assertion

#### A10. Reconcile existing `docs/DESIGN.md`, `docs/LORE.md`

**Description:** Light review pass to ensure DESIGN.md and LORE.md don't contradict the architectural decisions made since they were authored.

**Files:** `docs/DESIGN.md`, `docs/LORE.md`

**Acceptance criteria:**
- DESIGN.md tokens table matches `src/design/tokens.ts` once that file lands
- DESIGN.md no longer references the old "color gradient on home rows" design (we use distinct PBR sets, see DESIGN.md DESIGN.md edits in earlier session)
- LORE.md voice guide aligns with surface UI labels we'll use in `app/`

---

### Group B — Repo layout migration

#### B1. Apply `src/` vs `app/` split

**Description:** Move existing files into the new layout. `src/` holds only pure TypeScript (no JSX/TSX). `app/` holds all React. `src/render/` → `app/canvas/`; `src/ui/` → `app/screens/`; `src/main.tsx` → `app/main.tsx`; `src/App.tsx` → `app/App.tsx`; `src/index.html` → `app/index.html`; `src/css/` → `app/css/`; `src/manifest.json` → `public/manifest.webmanifest`; `src/sim/` (legacy types/coords/initialState) → `src/engine/` with `coords.ts` renamed `positions.ts` for 3D semantics. Drop `tests/` directory entirely.

**Files:** filesystem moves; `tsconfig.json`; `vite.config.ts`; `vitest.config.ts`; `biome.json`; `.gitignore`; `package.json` scripts

**Acceptance criteria:**
- `find src -name '*.tsx' -o -name '*.jsx'` returns zero results
- `find app -type f \( -name '*.tsx' -o -name '*.ts' \)` finds all React entry points
- `tsconfig.json` paths: `@/*` → `src/*`, `~/*` → `app/*`; both `src` and `app` in `include`
- `vite.config.ts` `root: 'app'`; aliases for `@` and `~`
- `vitest.config.ts` two projects: `node` (`src/**/__tests__/*.test.ts`) and `browser` (`app/**/__tests__/*.browser.test.tsx`)
- `biome.json` includes both `src/**` and `app/**`; React/JSX rules scoped to `app/**` override
- `pnpm typecheck` clean
- `pnpm lint` clean
- `pnpm build` produces `dist/` from `app/index.html` entry
- `tests/` directory does not exist

---

### Group C — `src/engine/` (TDD; primitive package, depends on nothing within src/)

#### C1. Write `src/engine/__tests__/positions.test.ts` (fast-check property tests)

**Description:** Property tests for the public positions API: `posToVector3`, `vector3ToPos`, `cellsEqual`, `chebyshevDistance`, `isOnBoard`. Use fast-check arbitraries to generate valid `Cell` and `Position` values; assert mathematical invariants (round-trip, symmetry, identity, triangle inequality, monotonicity within board). Tests target `import { ... } from '@/engine'` (the barrel) — no deep imports.

**Files:** `src/engine/__tests__/positions.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/engine` only
- ≥10 distinct property assertions
- Each property runs ≥100 fast-check iterations
- Test file fails when run before implementation lands (red bar verified)

#### C2. Write `src/engine/__tests__/slices.test.ts`

**Description:** Property tests for `partitionRuns(selectedIndices, stackHeight)`. Generate arbitrary subsets of `[0..H-1]` for `H ∈ [2, 12]`; assert: union of runs equals input as a set; each run is contiguous; runs are sorted; no two runs are adjacent (would-merge). Worked examples from RULES.md verified explicitly: `{0,1,4}` of 6 → `[[0,1],[4]]`; `{0,2,5}` of 6 → `[[0,2],[5]]`; `{0,1,2,3,4,5}` of 6 rejects (full stack ≠ split).

**Files:** `src/engine/__tests__/slices.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/engine`
- ≥6 property assertions plus ≥3 explicit worked-example tests
- Tests verify rejection of empty subset and full subset (both illegal as splits)

#### C3. Write `src/engine/__tests__/initialState.test.ts`

**Description:** Tests for `createInitialState({ firstPlayer })`. Asserts: 12 red pieces + 12 white pieces; rows 0/5/10 empty; 5-4-3 layout matches spec; first-mover honored; turn-counter at 0; no winner; no chain.

**Files:** `src/engine/__tests__/initialState.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/engine`
- All proposition checks asserted across both first-player options
- Test passes only after implementation matches spec exactly

#### C4. Write `src/engine/__tests__/environment.test.ts` (stepAction)

**Description:** Property tests for `stepAction(state, action) → state`. Generate arbitrary legal actions via fast-check on top of generated states; assert arithmetic invariants (total piece count preserved; source height before = source height after + moved height; destination height after = destination before + moved height); turn flips after non-chain moves; chain queues remaining runs after multi-run splits; chain re-validates destinations on resolve; chain aborts when destination becomes illegal mid-resolve.

**Files:** `src/engine/__tests__/environment.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/engine`
- ≥8 property assertions
- Explicit worked examples for: simple move, chonk on empty target, chonk on shorter target (illegal), chonk on equal-height target, chonk on taller target, single-run split, multi-run split with chain, chain abort
- Each property runs ≥200 fast-check iterations on legal-action arbitraries

#### C5. Write `src/engine/__tests__/env-query.test.ts`

**Description:** Tests for `isLegalAction`, `enumerateLegalActions`, `enumerateLegalRuns`, `isGameOver`. Property tests assert: every action returned by `enumerateLegalActions` passes `isLegalAction`; every action mutated to violate any rule fails `isLegalAction`; enumeration is deterministic (same state input → identical output); cardinality ≥ 1 for every non-terminal state.

**Files:** `src/engine/__tests__/env-query.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/engine`
- ≥6 property assertions
- Round-trip soundness asserted across ≥500 generated states

#### C6. Write `src/engine/__tests__/win-check.test.ts`

**Description:** Property tests for `isWin`, `isWinFor`. Asserts: empty board is non-terminal; constructed end-game positions return correct winner; reflection symmetry (mirroring board across center row swaps which player wins).

**Files:** `src/engine/__tests__/win-check.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/engine`
- ≥5 property assertions including reflection symmetry
- Constructed end-game positions cover edge cases (winning on the same turn the action was committed; tied-piece-count positions)

#### C7. Write `src/engine/__tests__/splitChain.test.ts`

**Description:** Tests for the chain state machine: queued runs apply in order; chain aborts when next destination becomes illegal at apply time; chain ends when last run resolves; pre-validated destinations at commit time; single-run splits leave no chain.

**Files:** `src/engine/__tests__/splitChain.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/engine`
- ≥5 property assertions
- Explicit test: 6-stack `{0,1,4}` split commits to `[[0,1],[4]]`, first turn applies `[0,1]`, opponent intervenes, second AI turn applies `[4]`
- Explicit test: chain abort scenario (opponent fills destination during intervening turn)

#### C8. Implement `src/engine/positions.ts`

**Description:** Implement positions API to make C1 pass. `posToVector3(col, row, h): Vector3` (uses Yuka's Vector3); `vector3ToPos(v): { col, row, h }`; `cellsEqual(a, b): boolean`; `chebyshevDistance(a, b): number`; `isOnBoard(c): boolean`. World transform constants for renderer alignment.

**Files:** `src/engine/positions.ts`

**Acceptance criteria:**
- C1 tests pass
- Imports `Vector3` from `yuka` (not from a different lib)
- Constants for `BOARD_COLS`, `BOARD_ROWS`, `CELL_SIZE`, `PUCK_HEIGHT`, `PUCK_GAP` exported

#### C9. Implement `src/engine/slices.ts`

**Description:** Implement `partitionRuns(selectedIndices, stackHeight): Run[]`. Pure combinatorics; no engine state involved.

**Files:** `src/engine/slices.ts`

**Acceptance criteria:**
- C2 tests pass

#### C10. Implement `src/engine/types.ts`

**Description:** All canonical engine types: `Color`, `Cell`, `Piece` (carries `col`/`row`/`h`/`color`), `Stack` (derived view, not stored — `materializeStack(board, col, row): Piece[]`), `Board = ReadonlyMap<bigint, Piece>` keyed by Zobrist-style 3D position hash, `Run`, `Action` (unified shape), `SplitChain`, `GameState`, `MatchState`.

**Files:** `src/engine/types.ts`

**Acceptance criteria:**
- All types exported
- `Action` is the unified shape `{ from, runs: [{ indices, to }] }`; pure moves are the degenerate one-run-all-indices case
- `Board` is a Map keyed by 3D position hash
- `materializeStack` helper exported

#### C11. Implement `src/engine/initialState.ts`

**Description:** `createInitialState({ firstPlayer }): GameState`. Builds the 5-4-3 layout into a `Board` Map; initial chain null; initial winner null.

**Files:** `src/engine/initialState.ts`

**Acceptance criteria:**
- C3 tests pass

#### C12. Implement `src/engine/environment.ts` (stepAction)

**Description:** Pure transition function. Applies the first run of the action atomically; queues remaining runs into `state.chain`; preserves piece colour identity through chonks; updates turn (or doesn't, in the chain-continuation case).

**Files:** `src/engine/environment.ts`

**Acceptance criteria:**
- C4 tests pass

#### C13. Implement `src/engine/env-query.ts`

**Description:** `isLegalAction(state, action) → boolean` (validates a concrete action, never throws); `enumerateLegalActions(state, side, opts?) → Action[]` (culled prioritized set for AI; `opts.exhaustive = true` returns full set for tests); `enumerateLegalRuns(state, from, indices) → Cell[]` (destination enumeration for one sub-stack); `isGameOver(state) → boolean`.

**Files:** `src/engine/env-query.ts`

**Acceptance criteria:**
- C5 tests pass
- Returned action lists are deterministic (sorted lexicographically by some stable key)

#### C14. Implement `src/engine/win-check.ts`

**Description:** `isWin(state)`, `isWinFor(state, side)`. Win iff all top-of-stacks of `side` are on the opponent's home row.

**Files:** `src/engine/win-check.ts`

**Acceptance criteria:**
- C6 tests pass

#### C15. Implement `src/engine/splitChain.ts`

**Description:** Chain state machine. `applyChainStep(state) → state` resolves the next queued run; aborts if destination became illegal; clears chain when last run resolves.

**Files:** `src/engine/splitChain.ts`

**Acceptance criteria:**
- C7 tests pass

#### C16. Implement `src/engine/game.ts`

**Description:** `createMatch({ matchId, firstPlayer, ... }): MatchState`; `runTurn(matchState, action): MatchState`. Match-level wrapper around `stepAction` plus per-turn metadata.

**Files:** `src/engine/game.ts`

**Acceptance criteria:**
- All C* tests pass
- Turn counter increments correctly across moves and chain continuations

#### C17. Author `src/engine/index.ts` barrel

**Description:** Public API surface. Re-exports all types + all functions named in `docs/RULES.md` and the test files. Nothing else; private helpers stay un-exported.

**Files:** `src/engine/index.ts`

**Acceptance criteria:**
- Every test file's imports resolve cleanly
- Engine package's exposed surface area matches docs/RULES.md exactly
- `pnpm typecheck` clean

---

### Group D — `src/ai/` (TDD; depends on real engine, no mocks)

#### D1. Write `src/ai/__tests__/zobrist.test.ts`

**Description:** Property tests for `zobristHash(state) → bigint`. Asserts: identical states hash identically; transposing two different paths to the same state yields identical hashes; 1M generated states produce 0 hash collisions; chain state included in hash (state with pending chain hashes differently from same board with chain null).

**Files:** `src/ai/__tests__/zobrist.test.ts`

**Acceptance criteria:**
- File exists; imports `{ zobristHash }` from `@/ai`; uses `createInitialState`, `stepAction` from `@/engine` (real engine, no mocks)
- Collision test runs ≥1M states across the 100-iteration property scope
- Hash includes chain state

#### D2. Write `src/ai/__tests__/perception.test.ts`

**Description:** Property tests for `perceive(state, action, radius)`. For radius 1, asserts the percept reads exactly the 8-cell neighborhood of the destination plus the destination itself. For radius 2, the 24-cell neighborhood. Mobility correctly distinguishes empty (open lane), chonkable (target height ≥ source), blocked (target shorter than source). Multi-run splits aggregate per-run perception.

**Files:** `src/ai/__tests__/perception.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/ai`; uses real engine
- Radius 1 / 2 / 3 all asserted
- Mobility breakdown asserted on canonical positions

#### D3. Write `src/ai/__tests__/disposition.test.ts`

**Description:** Tests for the disposition weight bundles. Asserts: aggressive scores chonk-on-opponent higher than defensive on canonical positions; defensive scores stack-height-build higher than aggressive; balanced is between both on every comparison. Memory features modulate effective weights as documented.

**Files:** `src/ai/__tests__/disposition.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/ai`
- Three dispositions × ≥3 comparison axes asserted
- Memory modulation asserted across ≥3 memory-feature scenarios

#### D4. Write `src/ai/__tests__/scoreNode.test.ts`

**Description:** Property tests for `scoreNode(percept, memoryFeatures, disposition)`. Asserts: monotone in dominant tops on opponent's home row (the closer you are to winning, the higher your score); penalizes vulnerability under defensive disposition; rewards advancement under aggressive.

**Files:** `src/ai/__tests__/scoreNode.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/ai`
- ≥5 monotonicity / direction assertions
- Constructed positions with known correct ordering verified

#### D5. Write `src/ai/__tests__/HistoryGraph.test.ts` and `LookaheadGraph.test.ts`

**Description:** Tests for the two graph wrappers around Yuka `Graph`. HistoryGraph: appendMove extends the chain; lookback walks back N edges; deterministic walk. LookaheadGraph: buildFromState produces correct subgraph at each depth limit; transposition reuses nodes on hash collision; propagateWeights produces correct minimax values on hand-constructed terminal positions.

**Files:** `src/ai/__tests__/HistoryGraph.test.ts`, `src/ai/__tests__/LookaheadGraph.test.ts`

**Acceptance criteria:**
- Both files exist; imports from `@/ai`; uses real engine
- HistoryGraph: ≥4 property assertions
- LookaheadGraph: ≥4 property assertions including transposition correctness
- minimax weight propagation asserted on known terminal positions

#### D6. Write `src/ai/__tests__/decide.test.ts`

**Description:** Tests for `decide(state, history, side, profile) → Action | { action, trace }`. Asserts: never returns illegal action across 1k fast-check states; deterministic (same inputs → byte-equal output × 5 runs); strength (depth-3 beats depth-1 on ≥70% of mirror-position games); variation (1k different states all produce distinct decisions where >1 candidate exists); trace is replayable bit-equal.

**Files:** `src/ai/__tests__/decide.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/ai`; uses real engine
- 1k fast-check legality assertions
- 5×100 determinism replay
- ≥70% strength assertion across 100 mirror-paired games at different depths

#### D7. Implement `src/ai/zobrist.ts`

**Description:** Zobrist hashing. 64-bit BigInt keys generated once per `(col, row, h, color)` tuple at module init via a deterministic hash function (NO `Math.random()` — keys are constants computed from position+color). `zobristHash(state): bigint` XORs keys for occupied positions plus chain-state markers.

**Files:** `src/ai/zobrist.ts`

**Acceptance criteria:**
- D1 tests pass
- No `Math.random()` anywhere
- Keys deterministic across builds

#### D8. Implement `src/ai/perception.ts`

**Description:** `perceive(state, action, radius): Percept`. Reads board around destination cell at the given radius; computes mobility (empty/chonkable/blocked counts); for splits, aggregates across all runs.

**Files:** `src/ai/perception.ts`

**Acceptance criteria:**
- D2 tests pass

#### D9. Implement `src/ai/memoryFeatures.ts`

**Description:** Extracts derived memory features from the HistoryGraph: `opponentRecentPushDirection`, `myExposedSavedTops`, `recentChonkExchanges`, `formationStability`. Features age via decay across turns.

**Files:** `src/ai/memoryFeatures.ts`

**Acceptance criteria:**
- Tests in D6 pass (decide consumes memory features)

#### D10. Implement `src/ai/disposition.ts`

**Description:** Three named disposition weight bundles. `effectiveWeights(disposition, memoryFeatures): Disposition` modulates base weights by memory.

**Files:** `src/ai/disposition.ts`

**Acceptance criteria:**
- D3 tests pass

#### D11. Implement `src/ai/scoreNode.ts`

**Description:** `scoreNode(percept, memoryFeatures, disposition): number`. Pure weighted sum of perception features × disposition weights × memory modulation.

**Files:** `src/ai/scoreNode.ts`

**Acceptance criteria:**
- D4 tests pass

#### D12. Implement `src/ai/HistoryGraph.ts` and `LookaheadGraph.ts`

**Description:** Both wrap Yuka `Graph`. HistoryGraph: linear chain of states-via-actions; appendMove extends; lookback walks backward. LookaheadGraph: built per AI turn; recursive expansion to depth limit; transposition via Zobrist hash check at each candidate add; minimax weight propagation post-expansion.

**Files:** `src/ai/HistoryGraph.ts`, `src/ai/LookaheadGraph.ts`

**Acceptance criteria:**
- D5 tests pass
- Both use Yuka's `Graph`/`Node`/`Edge` (not custom data structures)

#### D13. Implement `src/ai/search.ts`

**Description:** `alphaBetaMinimax(graph, root, depth, α, β, maximizingSide): { weight, bestEdge }`. Hand-rolled depth-limited alpha-beta. Lexicographic tiebreaking on equal weights.

**Files:** `src/ai/search.ts`

**Acceptance criteria:**
- D5 / D6 tests pass

#### D14. Implement `src/ai/profiles.ts`

**Description:** 9 profiles = 3 difficulties × 3 dispositions. Each profile is `{ perceptionRadius, memoryDepth, lookaheadDepth, disposition }`.

**Files:** `src/ai/profiles.ts`

**Acceptance criteria:**
- All 9 profiles enumerated
- Used by `decide` to thread through search + scoring

#### D15. Implement `src/ai/decide.ts`

**Description:** Public entry. Builds `LookaheadGraph` rooted at current state; calls `search`; picks best action; emits trace if `captureTrace: true`.

**Files:** `src/ai/decide.ts`

**Acceptance criteria:**
- D6 tests pass

#### D16. Write `src/ai/__tests__/snapshot.test.ts` — round-trip determinism

**Description:** Property tests for the AI's save/resume API. For arbitrary `(GameState, history, side, profile)` quads, asserts: `dumpAiState(history)` returns a JSON-serializable value; `loadAiState(dumpAiState(history))` produces a HistoryGraph that, when fed to `decide(state, history', side, profile)`, returns the byte-equal Action AND byte-equal DecisionTrace as `decide(state, history, side, profile)`. This is the determinism contract for save/resume.

Also asserts: `dumpAiState` output passes `JSON.stringify` cleanly (no circular references, no functions, no symbols); deserialized AiSnapshot can be transported through `JSON.stringify` + `JSON.parse` without loss.

**Files:** `src/ai/__tests__/snapshot.test.ts`

**Acceptance criteria:**
- File exists; imports `{ dumpAiState, loadAiState, decide, type AiSnapshot }` from `@/ai`
- ≥5 distinct property assertions
- ≥200 generated quads run through the round-trip
- Test fails before D17 lands

#### D17. Implement `src/ai/snapshot.ts` — `dumpAiState` and `loadAiState`

**Description:** Public API for save/resume. `dumpAiState(history): AiSnapshot` calls Yuka's `EntityManager.toJSON()` (or the equivalent on HistoryGraph) recursively. `loadAiState(snapshot): HistoryGraph` calls `fromJSON` then resolves cross-entity references via Yuka's `resolveReferences` pattern. The AiSnapshot type is documented in `docs/AI.md`.

Internal: snapshots include the AI difficulty + disposition the history was built with, so a snapshot loaded with the wrong profile throws clearly. Snapshots include a schema version (`v: 1`) for forward compatibility.

**Files:** `src/ai/snapshot.ts`

**Acceptance criteria:**
- D16 tests pass
- Yuka's `toJSON` / `fromJSON` / `resolveReferences` pattern used (not custom serialization)
- Snapshot includes profile metadata; loading with mismatched profile throws

#### D18. Author `src/ai/index.ts` barrel

**Description:** Public AI API. Exports `decide`, `dumpAiState`, `loadAiState`, all types (incl. `AiSnapshot`), `profiles`. Internal helpers stay un-exported.

**Files:** `src/ai/index.ts`

**Acceptance criteria:**
- Every D-test imports resolve cleanly
- Surface matches `docs/AI.md` exactly (including dump/load section)

---

### Group E — `src/store/` and `src/analytics/` (TDD; depends on real persistence + schema)

`src/store/` is the typed data-access layer for chonkers tables. Persistence is generic transport (`db.exec` / `db.query`); schema knows what tables exist; the store knows what *types* go in them. Each store module is a few SQL queries plus typed wrappers — `matches.insert(record)`, `moves.append(record)`, `traces.append(record)`, etc. The store is where chonkers-specific naming + chonkers-specific record shapes live.

`src/analytics/` is the read-side aggregate layer — pre-baked SQL queries computing win-rate-by-difficulty, turn-count-distribution, chonk-frequency, etc. Conceptually it could live inside `src/store/analytics.ts`; we extract it to `src/analytics/` so the read-only aggregate surface is distinct from the per-record CRUD surface, and so dev tooling can import analytics without dragging in CRUD types.

Both packages are TDD'd with real persistence + schema; no mocks anywhere.

#### E1. Write `src/store/__tests__/matches.test.ts`

**Description:** Tests for the matches store. Asserts: `matches.insert(record)` writes a row; `matches.get(id)` retrieves it as a typed `MatchRecord`; `matches.finalize(id, end)` updates ended_at/winner/end_reason; `matches.list({ finishedOnly, difficulty, disposition })` filters correctly; cascade-delete via foreign keys (insert match + moves + traces; delete match; assert moves + traces gone); typed errors on invalid records (e.g. non-string id throws clearly). All tests bootstrap the schema via `bootstrapChonkersSchema(name)`; isolated DB per test.

**Files:** `src/store/__tests__/matches.test.ts`

**Acceptance criteria:**
- File exists; imports `{ matches }` from `@/store`, `bootstrapChonkersSchema` from `@/schema`
- ≥6 distinct assertions
- Cascade verified end-to-end
- Test file fails when run before E5 lands

#### E2. Write `src/store/__tests__/moves.test.ts`

**Description:** Tests for the moves store. Asserts: `moves.append(record)` writes; `moves.list(matchId)` returns rows ordered by `move_index`; `moves.list(matchId, { side: 'red' })` filters; can't append to nonexistent match (FK violation surfaces); can't append duplicate `(match_id, move_index)`; `action_json` round-trips arbitrary serializable Action objects.

**Files:** `src/store/__tests__/moves.test.ts`

**Acceptance criteria:**
- ≥6 assertions
- ≥100 generated Action objects round-trip
- Test file fails when run before E6 lands

#### E3. Write `src/store/__tests__/traces.test.ts`

**Description:** Tests for the decision_traces store. Asserts: `traces.append(record)` writes; `traces.get(matchId, moveIndex)` retrieves; `trace_json` round-trips nontrivial nested DecisionTrace shapes; cascade-delete with match.

**Files:** `src/store/__tests__/traces.test.ts`

**Acceptance criteria:**
- ≥4 assertions
- Test file fails when run before E7 lands

#### E4. Write `src/store/__tests__/snapshot.test.ts`

**Description:** Tests for the AI-snapshot store helper. `snapshot.save(matchId, aiSnapshot)` writes the JSON to `matches.ai_snapshot_json`; `snapshot.get(matchId)` returns the parsed AiSnapshot or null; cascade-delete clears it (well, same row dies — test the "match doesn't exist returns null" path). `aiSnapshot` here is the shape from `@/ai`'s `AiSnapshot` type — real type, no mocks.

**Files:** `src/store/__tests__/snapshot.test.ts`

**Acceptance criteria:**
- ≥3 assertions
- Round-trip with a real `AiSnapshot` from `dumpAiState` (built against a constructed HistoryGraph)
- Test file fails when run before E8 lands

#### E5. Implement `src/store/matches.ts`

**Description:** `matches.insert`, `matches.get`, `matches.finalize`, `matches.list` against the matches table from schema 001-matches.

**Files:** `src/store/matches.ts`

**Acceptance criteria:**
- E1 tests pass
- All four functions exported and typed against `MatchRecord` from `src/store/types.ts`

#### E6. Implement `src/store/moves.ts`

**Description:** `moves.append`, `moves.list` (with optional side filter).

**Files:** `src/store/moves.ts`

**Acceptance criteria:**
- E2 tests pass

#### E7. Implement `src/store/traces.ts`

**Description:** `traces.append`, `traces.get`.

**Files:** `src/store/traces.ts`

**Acceptance criteria:**
- E3 tests pass

#### E8. Implement `src/store/snapshot.ts`

**Description:** `snapshot.save(matchId, aiSnapshot)` writes JSON-stringified AiSnapshot to `matches.ai_snapshot_json` via `db.exec('UPDATE matches SET ai_snapshot_json = ? WHERE id = ?', [JSON.stringify(snapshot), matchId])`. `snapshot.get(matchId)` reads it via `db.query<{ ai_snapshot_json: string | null }>` and JSON-parses if non-null.

**Files:** `src/store/snapshot.ts`

**Acceptance criteria:**
- E4 tests pass
- Type-imports `AiSnapshot` from `@/ai`

#### E9. Implement `src/store/types.ts`

**Description:** `MatchRecord`, `MoveRecord`, `TraceRecord`. Type-imports `Color`, `Action` from `@/engine`, `AiDifficulty`, `AiDisposition`, `AiSnapshot` from `@/ai`.

**Files:** `src/store/types.ts`

**Acceptance criteria:**
- All types exported

#### E10. Author `src/store/index.ts` barrel

**Description:** Exports `{ matches, moves, traces, snapshot }` namespaces and all types.

**Files:** `src/store/index.ts`

**Acceptance criteria:**
- All E* test imports resolve

#### E11. Write `src/analytics/__tests__/queries.test.ts`

**Description:** Tests for each pre-baked aggregate query. For each query, the test seeds a fresh DB with constructed matches + moves whose aggregate is known, runs the query via `db.query`, asserts the result. Queries: `winRateByDifficulty`, `winRateByDisposition`, `winRateByFirstMover`, `turnCountDistribution`, `chonkFrequency`, `splitFrequency`, `multiRunSplitFrequency`, `maxStackPerGame`, `firstMoverAdvantage`, `colourSymmetry`. Uses real `db` from `@/persistence`; isolated DB per test via `bootstrapChonkersSchema`.

**Files:** `src/analytics/__tests__/queries.test.ts`

**Acceptance criteria:**
- File exists; imports analytics queries from `@/analytics`, `bootstrapChonkersSchema` from `@/schema`
- Browser-tier vitest
- ≥10 distinct query assertions across the inventory
- Each query verified against a constructed DB whose aggregate is computable by hand

#### E12. Write `src/analytics/__tests__/propositions.test.ts`

**Description:** Tests for the `runProposition` runner. Each proposition has `{ name, query, threshold, rationale }`. Runner executes the query, applies the threshold predicate, returns `{ ok, observed, threshold, name }`. Tests cover: passing, failing, query error surfaces clearly, threshold predicates (gt, lt, between, all-true).

**Files:** `src/analytics/__tests__/propositions.test.ts`

**Acceptance criteria:**
- ≥6 assertions
- All threshold predicate types covered

#### E13. Implement `src/analytics/types.ts`

**Description:** Result shapes (`WinRateRow`, `TurnCountDistribution`, `ChonkFrequencyRow`), `Proposition`, `PropositionResult`, `ThresholdPredicate`.

**Files:** `src/analytics/types.ts`

**Acceptance criteria:**
- All types exported

#### E14. Implement `src/analytics/queries/*.ts`

**Description:** One file per query. Each exports a typed function calling `db.query<T>(sql, params)` against the chonkers connection. SQL inline; parameterized.

**Files:** `src/analytics/queries/{winRateByDifficulty,winRateByDisposition,winRateByFirstMover,turnCountDistribution,chonkFrequency,splitFrequency,multiRunSplitFrequency,maxStackPerGame,firstMoverAdvantage,colourSymmetry}.ts`, `src/analytics/queries/index.ts` barrel

**Acceptance criteria:**
- E11 tests pass
- Each query is a pure function; SQL parameterized

#### E15. Implement `src/analytics/propositions.ts`

**Description:** `runProposition(p)`, `runAll(props)`, threshold predicate types.

**Files:** `src/analytics/propositions.ts`

**Acceptance criteria:**
- E12 tests pass

#### E16. Author `src/analytics/index.ts` barrel

**Description:** Exports queries + propositions + types.

**Files:** `src/analytics/index.ts`

**Acceptance criteria:**
- All E* tests imports resolve cleanly
- Surface aligns with `docs/PROPERTIES.md` propositions

---

### Group F — `src/sim/` (TDD; depends on real engine + ai + persistence)

#### F1. Write `src/sim/__tests__/world.test.ts`

**Description:** Tests for the koota world bootstrap. `createSimWorld()` returns a world with Game and Match singleton entities, default Screen trait, default MatchMeta trait (no active match), default Settings synced from persistence (or defaults if persistence is empty).

**Files:** `src/sim/__tests__/world.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/sim`; uses real persistence (localStorage shim)
- World bootstraps consistently
- Singleton entities query-able via `world.queryFirst(Game)` and `world.queryFirst(Match)`

#### F2. Write `src/sim/__tests__/actions.test.ts`

**Description:** Tests for individual actions in `src/sim/actions.ts`. `newMatch` initializes a match: writes `MatchMeta` with fresh matchId, persists via `store.matches.insert`, sets `EngineState` trait to `createInitialState({firstPlayer})`, syncs per-piece traits, sets Screen to 'play'. `dispatchPlayerAction(action)` calls `stepAction`, updates `EngineState`, syncs per-piece traits, calls `store.moves.append`. `aiTakesTurn()` calls `decide`, dispatches the result via the same internal pipeline; in DEV captures trace via `store.traces.append`. `setSelection`/`openSplitOverlay`/`closeSplitOverlay` mutate UI traits without touching engine state. `continueMatch(matchId)` loads a persisted match (via `store.matches.get` + `store.moves.list`), replays moves through `stepAction`, restores world to current state.

**Files:** `src/sim/__tests__/actions.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/sim`; uses real engine + ai + store + persistence + schema
- Each action tested independently
- Action call leaves world in valid state (no partial mutations)
- Test isolates per-case via fresh DB (unique name through `bootstrapChonkersSchema`)

#### F2a. Write `src/sim/__tests__/save-resume.test.ts` — **the routing contract**

**Description:** Tests for the save/resume coordinator actions. `saveMatchProgress(matchId)` reads the AI's HistoryGraph from the koota Match singleton, calls `dumpAiState(history)` from `@/ai` to get an `AiSnapshot`, routes it to `store.snapshot.save(matchId, snapshot)` which writes `db.exec('UPDATE matches SET ai_snapshot_json = ? WHERE id = ?', ...)`. `resumeMatch(matchId)` reads `store.snapshot.get(matchId)`, calls `loadAiState(snapshot)` from `@/ai` to rebuild the HistoryGraph, populates the koota Match singleton's MatchAiState trait. Asserts: round-trip preservation (after save → close → resume, AI's next decision is byte-equal to what it would have been without saving); fallback to replay-from-moves when `ai_snapshot_json` is null (load `store.moves.list(matchId)`, replay through `stepAction` + `decide` to rebuild HistoryGraph deterministically); corrupted snapshot triggers fallback gracefully (snapshot.save with intentionally-broken JSON, resume reads it, parsing fails, falls back to replay, AI continues without disruption).

**Files:** `src/sim/__tests__/save-resume.test.ts`

**Acceptance criteria:**
- File exists; imports `{ saveMatchProgress, resumeMatch }` from `@/sim`; uses real engine + ai + store + persistence
- ≥4 distinct assertions: round-trip preservation, replay-fallback, corrupted-snapshot-fallback, multiple save/resume cycles preserve AI behavior
- Round-trip preservation asserted via deterministic decision check: same `(state, history-after-resume, side, profile)` → same Action as `(state, history-before-save, side, profile)`
- Test fails before F8 + F8a land

#### F3. Write `src/sim/__tests__/syncEngineToBoard.test.ts`

**Description:** Tests for the syncEngineToBoard system. Given an `EngineState` trait change, the system reconciles per-piece traits: spawns entities for newly-occupied positions, despawns entities for vacated positions, updates Position trait when pieces move. Idempotent (sync after no-op change is a no-op).

**Files:** `src/sim/__tests__/syncEngineToBoard.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/sim`; uses real engine
- Spawn / despawn / update all asserted
- Idempotency asserted

#### F4. Write `src/sim/__tests__/100-games.test.ts` — **THE BROKER DEMONSTRATION**

**Description:** The acceptance test for this entire PRD. Runs ≥100 full chonkers matches via `src/sim/actions.ts`. Each game: `newMatch({ aiDifficulty, aiDisposition, playerColor })` → loop until `Screen === 'win' | 'lose'` calling `aiTakesTurn()` for the AI side and `dispatchPlayerAction(decide(state, history, playerSide, profile))` for the player side (AI vs AI, both deterministic). On terminal: capture trace dump (the match record + moves from `store.matches.get` + `store.moves.list` + final state). Fresh DB per game via `bootstrapChonkersSchema(uniqueName)`. Assert per-game: every state transition was legal; turn count < 200; terminal state has a winner; store captured every move; `EngineState` trait at end matches the engine's final state from re-applying all moves; no leaks (entity count after match-quit equals bootstrap count).

The 100 matches span the difficulty × disposition matrix: every (red config, white config) pairing is represented at least once across the 81-pairing space; the remaining 19 pairings repeat the most-interesting matchups.

**Mid-match save/resume subset (10 of the 100):** for 10 of the 100 games, after turn 30, call `saveMatchProgress(matchId)`; close the DB connection; reopen via `bootstrapChonkersSchema(sameName)`; call `resumeMatch(matchId)`; play to completion. Assert: the resumed-game's terminal state matches the never-saved-game's terminal state for the same `(firstPlayer, redConfig, whiteConfig)` triple. **This is the proof that the save/resume routing contract holds end-to-end through the coordinator.**

After all 100, run the analytics propositions from `docs/PROPERTIES.md` against the union of all match DBs (or a single shared DB used in append mode for analytics; implementation choice): termination 100%, p99 turn count < 200, both colours win some, max stack across all games ≥ 4, chonks per game mean ≥ 4. The analytics queries hit real SQL via `db.query`. Determinism replay: pick 5 of the 100 configs, re-run, assert byte-equal final EngineState + identical move list.

**Files:** `src/sim/__tests__/100-games.test.ts`

**Acceptance criteria:**
- File exists; imports from `@/sim`, `@/analytics`; uses real engine + ai + store + persistence + schema (no mocks anywhere)
- Runs ≥100 distinct matches
- 10 of the 100 exercise save/resume mid-match; resumed terminal state matches non-resumed
- Every match terminates legally with a winner
- Aggregate propositions from `docs/PROPERTIES.md` all assert via `@/analytics` queries
- Determinism replay across 5 configs asserts byte-equality
- Test completes in <5 minutes on CI hardware
- **This is the PRD acceptance test.**

#### F5. Implement `src/sim/world.ts`

**Description:** `createSimWorld(): World`. Creates koota world; spawns Game singleton with Screen trait; spawns Match singleton with MatchMeta + EngineState traits set to defaults; returns world.

**Files:** `src/sim/world.ts`

**Acceptance criteria:**
- F1 tests pass

#### F6. Implement `src/sim/traits/`

**Description:** Trait definitions split by domain.
- `traits/piece.ts`: Position `{ col, row, h }`, Owner `{ color }`, IsSelected, IsDragging, IsAnimating tags
- `traits/animation.ts`: AnimationTween (AoS callback trait owning the mutable tween object)
- `traits/match.ts`: MatchMeta `{ matchId, firstPlayer, aiDifficulty, aiDisposition, playerColor, turn, winner, endReason }`, EngineState `{ gameState: GameState }`
- `traits/ui.ts`: Selection `{ selectedCell }`, SplitOverlay `{ open, sliceSelection, holdProgress }`, DragSubStack `{ runs, pointerWorld }`, ChainPending `{ remaining }`
- `traits/screen.ts`: Screen `{ value: 'title'|'play'|'win'|'lose'|'paused'|'settings' }`
- `traits/index.ts`: barrel

**Files:** `src/sim/traits/{piece,animation,match,ui,screen,index}.ts`

**Acceptance criteria:**
- All traits exported via `traits/index.ts`
- F2 / F3 tests reference these traits and pass

#### F7. Implement `src/sim/systems/syncEngineToBoard.ts`

**Description:** Diff-based reconciler. Reads current Match's EngineState; queries existing Position+Owner entities; computes diff (spawn / despawn / update); applies via koota actions.

**Files:** `src/sim/systems/syncEngineToBoard.ts`, `src/sim/systems/index.ts`

**Acceptance criteria:**
- F3 tests pass

#### F8. Implement `src/sim/actions.ts`

**Description:** All actions via `createActions((world) => ({ ... }))`. Public surface: `newMatch`, `continueMatch`, `dispatchPlayerAction`, `aiTakesTurn`, `setSelection`, `openSplitOverlay`, `closeSplitOverlay`, `armSplit`, `commitSplitDrag`, `cancelSplit`, `pause`, `resume`, `goToTitle`, `quitMatch`. Each action calls into engine + ai + store + persistence as appropriate; invokes `syncEngineToBoard` after EngineState mutations.

**Files:** `src/sim/actions.ts`

**Acceptance criteria:**
- F2 / F4 tests pass
- All actions documented in `docs/SIM.md` are implemented

#### F8a. Implement `saveMatchProgress` and `resumeMatch` in `src/sim/actions.ts` — **the routing layer**

**Description:** Two coordinator actions that route between the AI's public API and the store's transport. `saveMatchProgress(matchId)` reads the AI's HistoryGraph from the koota Match singleton, calls `dumpAiState(history)` from `@/ai` to get an `AiSnapshot` value, calls `store.snapshot.save(matchId, snapshot)` to write it to SQL. `resumeMatch(matchId)` calls `store.snapshot.get(matchId)`. If non-null, calls `loadAiState(snapshot)` from `@/ai` to rebuild HistoryGraph; populate the Match singleton's MatchAiState trait. If null OR if `loadAiState` throws (corrupted snapshot), falls back to **replay-from-moves**: call `store.moves.list(matchId)`, replay each through `stepAction` + `decide` to deterministically rebuild HistoryGraph. Either path produces an AI ready to continue with no behavioral disruption (proven by F2a tests).

**Files:** `src/sim/actions.ts` (added to existing file)

**Acceptance criteria:**
- F2a tests pass
- Sim is the ONLY layer touching both `@/ai`'s dump/load API and `@/store`'s snapshot helper in one function
- Fallback to replay-from-moves works when snapshot is missing OR corrupted
- AI behavior post-resume is identical to AI behavior had-no-save-occurred (asserted in F4 broker test save-resume subset)

#### F9. Author `src/sim/index.ts` barrel

**Description:** Public sim API. Exports `createSimWorld`, all traits, all actions via the koota convention.

**Files:** `src/sim/index.ts`

**Acceptance criteria:**
- All F-test imports resolve
- Surface matches `docs/SIM.md` exactly
- **F4 (100-games.test.ts) PASSES.**

---

### Group G — Repo health

#### G1. Update `pnpm` deps

**Description:** Add: `koota`, `howler`, `@types/howler`. Yuka stays. Drop: nothing further (multimcts and seedrandom were never installed; speculative entries already absent).

**Files:** `package.json`, `pnpm-lock.yaml`

**Acceptance criteria:**
- `pnpm install` produces a clean lockfile
- `pnpm typecheck` clean
- No `seedrandom`, no `multimcts`, no `zustand` in dependencies

#### G2. Author `.claude/gates.json`

**Description:** Coverage rules for `src/engine/**`, `src/ai/**`, `src/persistence/**`, `src/sim/**` requiring co-located `__tests__` updates with explicit-skip override syntax. Ban patterns: `Math.random()` anywhere in `src/`; cross-package import bans (engine cannot import ai/persistence/sim/audio/design; ai cannot import sim/audio/design/persistence at runtime — type-only OK; persistence cannot import sim/ai at runtime). Ban Yuka MathUtils/NavMesh/Wander/steering imports.

**Files:** `.claude/gates.json`

**Acceptance criteria:**
- File exists with documented ban_patterns and coverage_rules
- Manual verification: bans correctly fire on a synthetic violation

#### G3. Update `.agent-state/directive.md`

**Description:** Reflect the now-completed work: engine + ai + persistence + sim all green; broker test passes; visual wiring is the next milestone (separate PRD).

**Files:** `.agent-state/directive.md`

**Acceptance criteria:**
- Directive Status: RELEASED
- "What's done" section accurately reflects this PRD's deliverables
- "Queue — visual wiring" section enumerates next-milestone items at high level

#### G4. Run reviewer dispatch (autonomy doctrine)

**Description:** Per the autonomy doctrine in `~/.claude/CLAUDE.md`, after each commit dispatch reviewer agents (`comprehensive-review:full-review`, `security-scanning:security-sast`, `code-simplifier:code-simplifier`) in parallel + background scoped to the commit's diff. Findings fold into the next forward commit; never amend a reviewed commit.

**Files:** none — process step

**Acceptance criteria:**
- Reviewer findings on each commit captured (in `comments/` or PR thread)
- No `--no-verify` ever used
- No commits amended after review dispatch

---

## Configuration

```yaml
batch_name: chonkers-logic-surfaces-and-broker
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1   # serial within a group; group ordering enforces dependency chain
```

**Stop on failure: yes.** TDD discipline requires each test gate to pass before the next layer proceeds. A test failure in group C means engine isn't trustworthy and ai (group D) cannot be honestly tested against it. Halting on failure protects the no-mocks contract.

---

## Execution order (dependency-resolved)

```
A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9 → A10
       ↓ (docs are reference, B can start in parallel after A1-A3)
B1
       ↓
C1, C2, C3 (test files for primitives — can land in parallel)
       ↓
C8, C9, C10, C11 (impl primitives in parallel after their tests)
       ↓
C4, C5, C6, C7 (test files for behavior — depend on primitive types)
       ↓
C12, C13, C14, C15, C16 (impl behavior)
       ↓
C17 (engine barrel)
       ↓
D1, D2, D3, D4 (ai test files for primitives + scoring — engine real, no mocks)
       ↓
D7-D11 (ai primitives + scoring impl)
       ↓
D5 (graph wrappers test) → D12 (graph wrappers impl)
       ↓
D13, D14 (search + profiles impl)
       ↓
D6 (decide test) → D15 (decide impl)
       ↓
D16 (ai barrel)
       ↓
E1 (persistence test) → E2-E6 (persistence impl)
       ↓
F1, F2, F3 (sim test files — engine + ai + persistence all real)
       ↓
F5, F6, F7, F8 (sim impl)
       ↓
F9 (sim barrel)
       ↓
F4 (100-games broker test — THE acceptance test)
       ↓
G1 → G2 → G3 → G4
```

---

## Risks

- **Yuka Graph performance at chonkers branching factor.** Lookahead at depth 3 with ~200 candidates per turn is up to 8M state transitions worst case. Mitigated by Zobrist transposition (cuts redundant work) + alpha-beta pruning (cuts irrelevant subtrees) + culled `enumerateLegalActions` (prioritizes high-value moves). If performance is still inadequate at depth 3, fall back to depth 2 for hard difficulty until iterative-deepening is added.
- **fast-check arbitrary generation for legal actions.** Generating arbitrary `(state, action)` pairs where the action is legal requires a custom arbitrary that runs `enumerateLegalActions` and picks one. This adds runtime cost per test iteration. Mitigated by capping fast-check iteration counts at 100-500 per property and using simpler arbitraries for unit-level invariants.
- **localStorage size limits in browser.** Some browsers cap localStorage at 5MB. The 100-game broker test stores ~100 matches × ~50 moves × ~1KB per move = ~5MB if traces are full DecisionTrace JSON. Mitigated by: (a) traces only captured in dev mode (not in the broker test by default), (b) `Persistence.reset()` between games in tests so quota isn't exhausted, (c) the in-memory polyfill in node tier has no quota.
- **Yuka's Math.random() in unused subsystems.** Even though we don't import MathUtils, NavMesh, etc., a transitive Yuka import might pull them. Mitigated by: gates.json bans on those imports, and a verification test that asserts `Math.random` is unreachable from our code paths via static analysis or runtime monkeypatch detection.
- **Broker test runtime.** 100 games × average ~80 turns × per-turn AI search at hard difficulty could be slow. Mitigated by: most of the 100 games run at easy/normal difficulty (fast searches); only ~10 games at hard for variety; profile the test once and tighten if >5 minutes total.

---

## Definition of Done

- All A* documentation tasks merged.
- All B* migration tasks merged; vite/vitest/biome/tsconfig configs aligned; `pnpm build` clean.
- All C* engine tasks merged; `pnpm test:node -- src/engine` passes; `pnpm typecheck` clean.
- All D* ai tasks merged; `pnpm test:node -- src/ai` passes.
- All E* persistence tasks merged; `pnpm test:node -- src/persistence` passes.
- All F* sim tasks merged; **F4 (100-games.test.ts) passes**; final `pnpm test:node` runs all tiers green.
- All G* health tasks merged; gates.json + CLAUDE.md + .agent-state/directive.md current.
- `pnpm typecheck && pnpm lint && pnpm test:node && pnpm build` runs clean from root.
- Repository state pushed to `arcade-cabinet/chonkers` main; release-please opens its first release PR.

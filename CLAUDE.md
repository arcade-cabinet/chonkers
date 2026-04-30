<!-- profile: arcade-game + mobile-android + standard-repo v1 -->
# chonkers

Two-player abstract strategy game — checkers reimagined around stacking instead of capture. R3F + Radix + framer-motion + Capacitor on TypeScript 6.0+.

## Profiles loaded

The `@`-prefixed lines below are Claude Code's file-include syntax. They reference the executor's locally-installed Claude profile addendums (set up via the `/init-profile` skill). Other tools / CI pipelines / external developers can ignore them — this CLAUDE.md is documentation for those readers, configuration only for Claude Code.

@/Users/jbogaty/.claude/profiles/arcade-game.md
@/Users/jbogaty/.claude/profiles/mobile-android.md
@/Users/jbogaty/.claude/profiles/standard-repo.md

The included profile content is plain Markdown documenting the same conventions captured (in distilled form) in this file's "Strict architectural rules" + "Repo-specific" sections below. A reader without the profile files installed loses no information — the rules they encode are also present here.

## Repo-specific

- **Run dev:** `pnpm dev`
- **Typecheck:** `pnpm typecheck`
- **Lint:** `pnpm lint`
- **Tests (node tier):** `pnpm test:node`
- **Tests (browser tier):** `pnpm test:browser`
- **E2E smoke:** `pnpm test:e2e:ci`
- **E2E governor:** planned in [`docs/plans/e2e-governor.prq.md`](./docs/plans/e2e-governor.prq.md) — script will be added in PRQ-6
- **Production build:** `pnpm build`
- **Capacitor sync:** `pnpm cap:sync`
- **Android debug APK:** `pnpm native:android:debug` (works after PRQ-7 native-shell completes; uses existing `cap:sync`)
- **iOS debug build:** `pnpm native:ios:build` (same — works post PRQ-7)

Commands marked "planned" or "post-PRQ-N" are not yet runnable; the PRD that adds them is referenced. All commands without that note work today.

## Coordination

This repo runs in **autonomous long-running execution mode**. The execution surface is:

- **The queue:** [`.agent-state/directive.md`](./.agent-state/directive.md) — the live PRD pipeline, who's working on what right now, what's done, what's blocked. Read this first on every session start.
- **The PRDs:** [`docs/plans/*.prq.md`](./docs/plans/) — one PRD per major slice, each with locked acceptance criteria + task list. The six PRDs in dependency order: persistence-and-db, logic-surfaces-and-broker, audio-and-design-tokens, visual-shell, e2e-governor, native-shell. (Schema was originally a separate PRD; it has been merged into persistence-and-db so the drizzle schema, build-time `public/game.db` pipeline, and runtime version-replay all land in one PR — see `docs/DB.md`.)
- **The runbook:** [`docs/plans/EXECUTION.md`](./docs/plans/EXECUTION.md) — PR-per-PRD workflow, branch naming, commit cadence, reviewer dispatch, merge gate.
- **The autonomy reference:** [`docs/plans/AUTONOMY.md`](./docs/plans/AUTONOMY.md) — `gh` + GraphQL recipes for thread resolution, change-request handling, self-approval, squash-merge, STOP_FAIL recovery.

**One PRD = one PR.** Each PRD lands as a single squash-merge after CI green + threads resolved + acceptance criteria met. The autonomous executor handles the full review feedback cycle through GraphQL mutations (resolving threads, dismissing prior CHANGES_REQUESTED reviews from itself, self-approving when all gates pass).

## Architecture cheat-sheet

```text
src/                               # PURE TYPESCRIPT — no JSX, no React, no DOM
├── persistence/                   # Durable storage layer
│   ├── preferences/               # typed JSON kv over @capacitor/preferences
│   └── sqlite/                    # drizzle ORM + @capacitor-community/sqlite,
│                                  # build-time game.db, runtime version-replay
├── engine/                        # Pure rules engine. 3D occupancy state. No PRNG.
├── ai/                            # Yuka Graph + alpha-beta minimax. 9 disposition×difficulty
│                                  # profiles. Deterministic. dumpAiState/loadAiState.
├── store/                         # Typed CRUD repos over drizzle (matchesRepo, movesRepo,
│                                  # aiStatesRepo, analyticsRepo).
├── analytics/                     # Pre-baked aggregate refresh logic. Materialised rows.
├── sim/                           # Koota state layer + actions broker. Routes save/resume.
│                                  # Owns coin_flip_seed (only entropy in the system).
├── audio/                         # Howler bus, seven committed clips, role-keyed.
├── design/                        # Tokens + Radix theme + framer-motion variants.
└── utils/                         # Coords, type guards, asset manifest.

app/                               # ALL .tsx LIVES HERE — React, R3F, Radix, framer-motion
├── main.tsx, App.tsx, index.html
├── canvas/                        # R3F scene: Bezel, Board, Pieces, TippingBoard,
│                                  # SelectionOverlay, SplitArmHeightBar, CellHitboxGrid,
│                                  # CoinFlipChip, DemoPieces, BezelButtons, BezelGestures
├── screens/                       # Radix full-screen views (LobbyView, PlayView, EndScreen, PauseView)
├── hooks/                         # useWorldEntity, useHaptics, etc.
├── boot/                          # Boot + ErrorBoundary + SimContext
└── css/                           # Global CSS + runtime @font-face installer (fonts.ts)

scripts/                           # Build-time scripts incl. build-game-db.mjs
drizzle/                           # drizzle-kit-generated migration SQL (committed to git)
e2e/                               # Playwright specs incl. governor.spec.ts
docs/                              # Canonical docs: RULES, DESIGN, LORE, ARCHITECTURE,
│                                  # PERSISTENCE, DB, AI, TESTING, STATE.
docs/plans/                        # PRDs + execution runbooks (this file's neighbors)
.agent-state/                      # Live working memory (directive, digest, cursor)
```

## Strict architectural rules

- **`src/*`** never imports from `app/*`. Provable by grep + lint.
- **No React imports in `src/*`.** Lint-enforced.
- **`src/engine/*`** never imports `src/ai/*`, `src/sim/*`, or `src/store/*`.
- **`src/ai/*`** imports only from `src/engine/*` (one-way).
- **`src/persistence/preferences/*`** is a leaf — imports nothing from other `src/` packages.
- **`src/persistence/sqlite/*`** imports only the drizzle / capacitor / better-sqlite3 deps it needs; nothing from `src/{engine,ai,sim,store}/`.
- **`src/store/*`** imports from `src/persistence/sqlite/*` for drizzle handles; type-only from `src/{engine,ai}/*`.
- **`src/sim/*`** is the broker — imports from `src/{engine,ai,store,persistence,audio}/*`. Only place that calls `crypto.getRandomValues()` (for the per-match `coin_flip_seed`).
- **No `Math.random()`** in `src/{engine,ai,sim,store}/`. Banned by `.claude/gates.json`. The sim broker's coin-flip is the only entropy source.
- **No mocks** in tests (per `docs/TESTING.md`). Each layer's tests use the real layer below it. Tier 1 uses `makeTestDb()` (real `better-sqlite3`); Tier 2 uses real capacitor-sqlite; Tier 3 runs the full stack. The 100-run broker test is the alpha-stage integration assertion.

Per-repo specifics that override profile defaults: see profile files for the standard rules; this CLAUDE.md only adds chonkers-unique items.

## Notes

- **Active PRD pointer:** check `.agent-state/directive.md` `Currently working on:` line.
- **HALT state:** if `.agent-state/HALT.md` exists, read it first — the previous session halted on a STOP_FAIL condition that needs user input before work resumes.
- **GitHub:** repo is `arcade-cabinet/chonkers`, public, owned by jbcom. `gh auth status` should show active auth with `repo` scope.
- **Reviewer dispatch:** every commit dispatches `comprehensive-review:full-review`, `security-scanning:security-sast`, `code-simplifier:code-simplifier` in parallel + background per `~/.claude/CLAUDE.md` autonomy doctrine.

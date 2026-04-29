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
- **E2E governor:** `pnpm test:e2e:governor`
- **Production build:** `pnpm build`
- **Capacitor sync:** `pnpm cap:sync`
- **Android debug APK:** `pnpm native:android:debug`
- **iOS debug build:** `pnpm native:ios:build`

## Coordination

This repo runs in **autonomous long-running execution mode**. The execution surface is:

- **The queue:** [`.agent-state/directive.md`](./.agent-state/directive.md) — the live PRD pipeline, who's working on what right now, what's done, what's blocked. Read this first on every session start.
- **The PRDs:** [`docs/plans/*.prq.md`](./docs/plans/) — one PRD per major slice, each with locked acceptance criteria + task list. The seven PRDs in dependency order: persistence, schema, logic-surfaces-and-broker, audio-and-design-tokens, visual-shell, e2e-governor, native-shell.
- **The runbook:** [`docs/plans/EXECUTION.md`](./docs/plans/EXECUTION.md) — PR-per-PRD workflow, branch naming, commit cadence, reviewer dispatch, merge gate.
- **The autonomy reference:** [`docs/plans/AUTONOMY.md`](./docs/plans/AUTONOMY.md) — `gh` + GraphQL recipes for thread resolution, change-request handling, self-approval, squash-merge, STOP_FAIL recovery.

**One PRD = one PR.** Each PRD lands as a single squash-merge after CI green + threads resolved + acceptance criteria met. The autonomous executor handles the full review feedback cycle through GraphQL mutations (resolving threads, dismissing prior CHANGES_REQUESTED reviews from itself, self-approving when all gates pass).

## Architecture cheat-sheet

```
src/                               # PURE TYPESCRIPT — no JSX, no React, no DOM
├── persistence/                   # Capacitor Preferences (kv) + Capacitor SQLite (db). Generic.
├── schema/                        # Forward-only migration runner + chonkers SQL files.
├── engine/                        # Pure rules engine. 3D occupancy state. No randomness.
├── ai/                            # Yuka Graph + alpha-beta minimax. Deterministic. dumpAiState/loadAiState.
├── store/                         # Typed data-access over schema's tables. Reads db, encodes types.
├── analytics/                     # Pre-baked aggregate SQL queries via db.query.
├── sim/                           # Koota state layer + actions broker. Routes save/resume.
├── audio/                         # Howler bus, six committed clips, role-keyed.
├── design/                        # Tokens + Radix theme + framer-motion variants.
└── ...

app/                               # ALL .tsx LIVES HERE — React, R3F, Radix, framer-motion
├── main.tsx, App.tsx, index.html
├── canvas/                        # R3F scene
├── screens/                       # Radix full-screen views
├── components/                    # Radix atoms incl. SplitRadial
├── input/                         # Pointer/touch pipeline
├── hooks/                         # usePrefs, useFrameloop, etc.
├── boot/                          # Boot + ErrorBoundary
└── css/

e2e/                               # Playwright specs
docs/                              # Authoritative docs (RULES, AI, SIM, PERSISTENCE, SCHEMA, etc.)
docs/plans/                        # PRDs + execution runbooks (this file's neighbors)
.agent-state/                      # Live working memory (directive, digest, cursor)
```

## Strict architectural rules

- **`src/*`** never imports from `app/*`. Provable by `grep -r "from '~/" src` returning empty.
- **`src/engine/*`** never imports from `src/ai/*` or `src/sim/*`.
- **`src/ai/*`** imports from `src/engine/*` only (one-way).
- **`src/persistence/*`** never imports from `src/engine/*`, `src/ai/*`, `src/sim/*`, `src/store/*`, `src/schema/*`. It's pure transport.
- **`src/schema/*`** imports from `src/persistence/*` only.
- **`src/store/*`** imports from `src/persistence/*`, `src/schema/*`, plus type-only imports from `src/engine/*` and `src/ai/*`.
- **`src/sim/*`** is the broker — imports from `src/engine/*`, `src/ai/*`, `src/store/*`, `src/persistence/*`, `src/schema/*`.
- **No `Math.random()`** outside permitted scopes (defined in `.claude/gates.json` — eventually). Game logic is fully deterministic.
- **No React in `src/`.** Provable by lint.
- **No mocks** in tests. Each layer's tests use the real layer below it. The 100-game broker test is the integration assertion.

Per-repo specifics that override profile defaults: see profile files for the standard rules; this CLAUDE.md only adds chonkers-unique items.

## Notes

- **Active PRD pointer:** check `.agent-state/directive.md` `Currently working on:` line.
- **HALT state:** if `.agent-state/HALT.md` exists, read it first — the previous session halted on a STOP_FAIL condition that needs user input before work resumes.
- **GitHub:** repo is `arcade-cabinet/chonkers`, public, owned by jbcom. `gh auth status` should show active auth with `repo` scope.
- **Reviewer dispatch:** every commit dispatches `comprehensive-review:full-review`, `security-scanning:security-sast`, `code-simplifier:code-simplifier` in parallel + background per `~/.claude/CLAUDE.md` autonomy doctrine.

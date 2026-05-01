<!-- profile: arcade-game + mobile-android + standard-repo v1 -->
# chonkers

Two-player abstract strategy game — checkers reimagined around stacking instead of capture. Vanilla three.js + gsap canvas universe (`src/scene/`) + Solid TSX branded overlays for menus (`app/`), wrapped by Capacitor for native, on TypeScript 6.0+. **No React, no R3F, no Radix, no framer-motion anywhere in the application. Solid is permitted ONLY inside `app/`.**

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
- **E2E governor:** see [`docs/plans/e2e-governor.prq.md`](./docs/plans/e2e-governor.prq.md)
- **Production build:** `pnpm build`
- **Capacitor sync:** `pnpm cap:sync`
- **Android debug APK:** `pnpm native:android:debug`
- **iOS debug build:** `pnpm native:ios:build`

## Coordination

This repo runs in **autonomous long-running execution mode**. The execution surface is:

- **The queue:** [`.agent-state/directive.md`](./.agent-state/directive.md) — the live PRD pipeline, who's working on what right now, what's done, what's blocked. Read this first on every session start.
- **The PRDs:** [`docs/plans/*.prq.md`](./docs/plans/) — one PRD per major slice, each with locked acceptance criteria + task list. Active PRDs in dependency order: logic-surfaces-and-broker (engine + AI + sim broker — shipped), audio-and-design-tokens (audio bus + tokens — shipped), e2e-governor, native-shell. The visual-shell PRD was retired and replaced by the threejs-shell rebuild (see `.agent-state/directive.md`). The persistence-and-db PRD was retired with the SQLite rip (PRQ-T-persist) — persistence is now KV-only and documented in `docs/PERSISTENCE.md`.
- **The runbook:** [`docs/plans/EXECUTION.md`](./docs/plans/EXECUTION.md) — PR-per-PRD workflow, branch naming, commit cadence, reviewer dispatch, merge gate.
- **The autonomy reference:** [`docs/plans/AUTONOMY.md`](./docs/plans/AUTONOMY.md) — `gh` + GraphQL recipes for thread resolution, change-request handling, self-approval, squash-merge, STOP_FAIL recovery.

**One PRD = one PR.** Each PRD lands as a single squash-merge after CI green + threads resolved + acceptance criteria met. The autonomous executor handles the full review feedback cycle through GraphQL mutations (resolving threads, dismissing prior CHANGES_REQUESTED reviews from itself, self-approving when all gates pass).

## Architecture cheat-sheet

```text
index.html                         # Two universes mounted side-by-side:
                                   #   <canvas>            → src/scene/index.ts (three.js + gsap)
                                   #   <div id="ui-root">  → app/main.tsx     (Solid TSX overlays)
                                   #   <div id="overlay">  → src/scene/overlay (diegetic SVG)
app/                               # SOLID UNIVERSE — branded centered overlays only.
├── main.tsx                       # Solid render root. Subscribes to koota.
├── overlays/                      # One file per overlay screen.
│   ├── Lobby.tsx                  # Title: New Game / Continue Game / Settings.
│   ├── NewGameConfig.tsx          # 4 cards: Easy / Medium / Hard / Pass-and-Play.
│   ├── Settings.tsx               # Audio / haptics / reduced-motion / default difficulty.
│   ├── Pause.tsx                  # Resume / Settings / Quit.
│   └── EndGame.tsx                # Play Again / Quit.
├── primitives/                    # Branded Modal, Button, Card primitives.
├── stores/                        # Solid signals reflecting koota state.
└── styles.css                     # Overlay-only CSS.
src/                               # CANVAS UNIVERSE — three.js + gsap + game logic.
├── scene/                         # three.js scene + gsap tweens + diegetic SVG overlay.
│   ├── index.ts                   # Boot: mounts canvas, runs rAF loop, subscribes to koota.
│   ├── board.ts                   # 9×11 wood surface — interior playfield (WoodFloor007 PBR) +
│   │                              # home rows (WoodFloor008 PBR), engraved gridlines, bezel frame.
│   ├── pieces.ts                  # Stack rendering: THREE.Group per cell, N puck meshes.
│   ├── lighting.ts                # HDRI + key/fill/rim directional lights.
│   ├── camera.ts                  # Tilted "sitting at the table" camera + axis tip per turn.
│   ├── coinFlip.ts                # 3D coin spawn + gsap spin + landing assignment.
│   ├── input.ts                   # Raycaster against board plane + pieces; pointer routing;
│   │                              # pivot-drag turn-end gesture (180° rotation in PaP).
│   ├── animations.ts              # gsap tween factories. Reduced-motion variants here.
│   └── overlay/                   # Diegetic SVG overlays positioned per-frame via camera.project().
│       └── splitRadial.ts         # The ONLY remaining diegetic overlay — anchored to a stack.
├── persistence/                   # Typed JSON KV over @capacitor/preferences. NO SQLite.
├── engine/                        # Pure rules engine. 3D occupancy state. No PRNG.
├── ai/                            # Yuka Graph + alpha-beta minimax. 9 profiles. Deterministic.
├── sim/                           # Koota state layer + headless actions broker. Owns coinFlipSeed
│                                  # (only entropy). Modes: vs-AI, Pass-and-Play (humanColor="both"),
│                                  # AI-vs-AI sim (humanColor=null).
├── audio/                         # Howler bus, role-keyed clips.
├── design/                        # tokens.ts only — palette, typography, motion durations.
│                                  # Consumed by both src/scene/ AND app/ (design-system shared).
└── utils/                         # Coords, type guards, asset manifest.

scripts/                           # (currently empty)
e2e/                               # Playwright specs incl. governor.spec.ts + accessibility.spec.ts
docs/                              # Canonical docs: RULES, DESIGN, LORE, ARCHITECTURE, UI_FLOWS,
│                                  # PERSISTENCE, AI, TESTING, STATE.
docs/plans/                        # PRDs + execution runbooks
.agent-state/                      # Live working memory (directive, digest, cursor)
```

## Strict architectural rules

- **`app/`** holds Solid TSX overlay components (lobby, new-game config, settings, pause, end-game). Imports `solid-js`, `koota`, `app/**`, and the broker `actions` namespace via the koota world. Never imports `three`, `gsap`, or any module under `src/scene/`. Per PRQ-C* (2026-04-30).
- **`src/`** holds the canvas universe + game logic. Never imports `solid-js`. Never imports anything under `app/**`.
- **No React anywhere in the project.** Biome rule + lint.
- **No R3F / Radix / framer-motion imports anywhere.** Biome rule + lint.
- **No SQLite, drizzle, or relational database.** Persistence is KV-only via `@capacitor/preferences`.
- **`src/engine/*`** never imports `src/ai/*`, `src/sim/*`, or `src/scene/*`.
- **`src/ai/*`** imports only from `src/engine/*` (one-way).
- **`src/persistence/preferences/*`** is the KV layer — imports `@capacitor/preferences` for storage; type-only from `src/{engine,sim}/*`. Runtime imports from `src/ai/*` are confined to `dumpAiState` / `loadAiState` for AI-brain (de)serialization (a typed-only contract is impossible because the AI brain must round-trip through base64). `snapshotFromHandle` builds the persistable shape; `restoreAiPair` rebuilds the runtime brain pair.
- **`src/sim/*`** is the broker — imports from `src/{engine,ai}/*`. Only place that calls `crypto.getRandomValues()` (for the per-match `coinFlipSeed`).
- **`src/scene/*`** is the render layer — imports from `src/{sim,audio,design,persistence,utils}/*` only; type-only from `src/{engine,ai}/*`. Uses `three` + `gsap` + DOM SVG APIs. Wires `onPlyCommit` / `onMatchEnd` to `saveActiveMatch` / `clearActiveMatch`.
- **No `Math.random()`** in `src/{engine,ai,sim}/`. Banned by `.claude/gates.json`. The sim broker's coin-flip is the only entropy source.
- **No mocks** in tests (per `docs/TESTING.md`). Each layer's tests use the real layer below it. The 100-run broker test is the alpha-stage integration assertion (pure in-memory, no persistence side effect).

Per-repo specifics that override profile defaults: see profile files for the standard rules; this CLAUDE.md only adds chonkers-unique items.

## UI surface rule (revised PRQ-C*, 2026-04-30)

Two universes:

- **Diegetic SVG overlays** (`src/scene/overlay/`) own per-stack interaction during play. Today: the splitting radial. There are no diegetic menus, no in-game floating buttons during a turn — the only persistent in-game chrome is the bezel hamburger (a single DOM button overlaid on the canvas, opening the Pause overlay).
- **Branded centered overlays** (`app/`, Solid TSX) own the lobby title, new-game configuration (difficulty + Pass-and-Play), settings, pause, end-game. Real `<dialog>` elements with focus traps + ESC handling. Axe-passable, Playwright-clickable without testHook shortcuts.

The board IS the playfield. The overlays ARE the menus. See `docs/UI_FLOWS.md` for the full state diagrams and `docs/DESIGN.md` §"UI surfaces" for the surface map.

## Notes

- **Active PRD pointer:** check `.agent-state/directive.md` `Currently working on:` line.
- **HALT state:** if `.agent-state/HALT.md` exists, read it first — the previous session halted on a STOP_FAIL condition that needs user input before work resumes.
- **GitHub:** repo is `arcade-cabinet/chonkers`, public, owned by jbcom. `gh auth status` should show active auth with `repo` scope.
- **Reviewer dispatch:** every commit dispatches `comprehensive-review:full-review`, `security-scanning:security-sast`, `code-simplifier:code-simplifier` in parallel + background per `~/.claude/CLAUDE.md` autonomy doctrine.

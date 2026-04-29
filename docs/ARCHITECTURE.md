---
title: Architecture
updated: 2026-04-29
status: current
domain: technical
---

# Architecture

## Top-level boundaries

```
Input (pointer/touch + radial overlay, app/input/)
    │
    ▼
Sim broker (src/sim/) ──── coordinates engine + ai + store + persistence
    │
    ├─► Engine    (src/engine/)   pure rules, deterministic, no IO
    ├─► AI        (src/ai/)       Yuka Graph + alpha-beta minimax, deterministic, no PRNG
    ├─► Store     (src/store/)    typed CRUD over db tables
    ├─► Analytics (src/analytics/) materialised aggregate queries
    │
    ├─► R3F render tree   (app/canvas/)     subscribes to koota
    ├─► Radix UI shell    (app/screens/, app/components/)  subscribes to koota
    │
    └─► Audio bus        (src/audio/)       dispatched as side-effects from sim broker

Persistence:
    ├─► Capacitor Preferences  (src/persistence/)  typed JSON kv  — settings, last-camera-angle, profile pair, audio volume
    └─► SQLite via Capacitor   (src/persistence/sqlite/) drizzle ORM — match history, AI dumps, analytics aggregates
```

State flows through the sim broker. Render trees subscribe to koota traits; they never mutate state directly. The broker is the only module that imports from both the logic side (engine/ai/store) and the IO side (persistence/db/audio).

## The src/ vs app/ split

`src/` is **pure TypeScript with no JSX, no React, no DOM**. Every module is testable in node, callable from a build-time script, portable to other arcade-cabinet projects.

`app/` is **the React shell**. All `.tsx` lives here. R3F, Radix Themes, framer-motion, hooks, screens, and the boot sequence.

Provable rules:

| Rule | How it's enforced |
|---|---|
| `src/*` never imports from `app/*` | grep + lint |
| No React imports in `src/*` | biome rule + lint |
| `src/engine/*` never imports `src/ai/*`, `src/sim/*`, or `src/store/*` | lint + audited at PR review |
| `src/ai/*` imports only from `src/engine/*` (one-way) | same |
| `src/persistence/preferences/*` is a leaf — imports nothing from other `src/` packages | same |
| `src/persistence/sqlite/*` imports only the drizzle / capacitor / better-sqlite3 deps it needs; nothing from `src/{engine,ai,sim,store}/` | same |
| `src/store/*` imports from `src/persistence/sqlite/*` for drizzle handles; type-only from `src/{engine,ai}/*` | same |
| `src/sim/*` is the broker — imports from `src/{engine,ai,store,persistence,audio}/*` | same |
| No `Math.random()` in `src/{engine,ai,sim,store}/*` | gates.json ban pattern |
| No mocks in tests | doctrine; each layer's tests use the real layer below |

## Module boundaries

| Directory | Responsibility | Notes |
|---|---|---|
| `src/persistence/` | Typed JSON KV over `@capacitor/preferences`. Generic transport, no chonkers concepts. | See `docs/PERSISTENCE.md`. |
| `src/persistence/sqlite/` | drizzle ORM + `@capacitor-community/sqlite` runtime + build-time `public/game.db` pipeline. Schema is the source of truth for the match-history database. | See `docs/DB.md`. |
| `src/engine/` | Pure rules engine: 3D occupancy state, move generation, win check, split-chain state machine, Zobrist position hash. Pure TS. | Tested in node with no DOM. |
| `src/ai/` | Yuka Graph (state-space) + alpha-beta minimax + 9 disposition×difficulty profiles. `dumpAiState` / `loadAiState` public API. Forfeit as a weighted action. | Deterministic. No PRNG. See `docs/AI.md`. |
| `src/store/` | Typed data-access over `src/persistence/sqlite/` tables. Encodes types; reads + writes through drizzle repos. | Pure TS. |
| `src/analytics/` | Aggregate queries (win-rate by profile, avg game length, opening frequency, etc.). Pre-baked materialised rows refreshed on match-end by the sim broker. | Pure TS. |
| `src/sim/` | Koota state layer + actions broker. Routes save/resume between engine, ai, store, db. Owns `saveMatchProgress` / `resumeMatch` / `dispatchAiTurn`. | Pure TS. |
| `src/audio/` | Howler-backed audio bus. Seven role-keyed clips. Volume reads from kv. | Pure TS; HTMLAudioElement under the hood. |
| `src/design/` | Design tokens, Radix theme config, framer-motion variant library. | Pure TS. |
| `src/utils/` | Pure utilities: coords, type guards, asserts. | Pure TS. |
| `app/canvas/` | R3F scene tree: board mesh, piece pucks, lighting, environment, overlay anchor. | All `.tsx`. |
| `app/screens/` | Radix full-screen views: title, settings, pause, win, lose. | All `.tsx`. |
| `app/components/` | Radix atoms shared across screens, including `SplitRadial` (the SVG radial overlay). | All `.tsx`. |
| `app/input/` | Pointer/touch pipeline: pointer normalisation, hold-timer, drag-tracker. | All `.tsx`. |
| `app/hooks/` | React hooks: `usePrefs` (kv reads), `useFrameloop`, `useMatchSubscription` (koota). | All `.tsx`. |
| `app/boot/` | App boot sequence + ErrorBoundary. | All `.tsx`. |
| `app/css/` | Global CSS + `@font-face` declarations. | |

## State management

`koota` (entity-component-system) replaces the earlier Zustand reference. Match state — board occupancy, current turn, active split chain, AI think-state — lives as koota traits on a singleton match entity. Render trees subscribe to traits via koota's React adapter. The sim broker mutates traits as the engine and AI return new states.

Persistence is *not* in koota. The koota world is rebuilt on app boot (or on match resume) from the database — the database is durable; koota is the in-memory working set.

## R3F scene tree

```
<Canvas shadows dpr={[1, 2]}>
  <Environment files="/assets/hdri/background.exr" background blur={0.4} />
  <Lighting />                 // key + fill + rim
  <Board />                    // 9×11 mesh, wood PBR, engraved gridlines
  <HomeRowGradient />          // shader overlay on rows 0 + 10 (distinct PBR wood)
  <StackGroup>                 // one <Stack> per non-empty cell
    <Stack col row stack />    // N <Piece> stacked vertically
  </StackGroup>
  <SelectionRing />            // selected cell glow
  <ValidMoveMarkers />         // dots on legal destinations
  <SplitOverlayAnchor />       // 3D position → 2D screen-projection sink
</Canvas>
<SplitRadial />                // SVG, html-layered above canvas
<Hud />                        // Radix UI HUD
```

The split overlay is **outside** `<Canvas>` — it's HTML/SVG. An anchor inside the canvas projects the active stack's world position to screen-space and writes the screen-coords to a koota trait; the overlay reads the trait and positions itself with CSS `transform`.

## Asset loading

All assets live under `public/assets/` and are addressed by a strict roles map:

```ts
// src/utils/manifest.ts
export const ASSETS = {
  hdri:    '/assets/hdri/background.exr',
  audio: {
    ambient: '/assets/audio/ambient/bg_loop.wav',
    move:    '/assets/audio/effects/move.ogg',
    chonk:   '/assets/audio/effects/chonk.ogg',
    split:   '/assets/audio/effects/split.ogg',
    sting:   '/assets/audio/effects/game_over_sting.ogg',
    win:     '/assets/audio/voices/you_win.ogg',
    lose:    '/assets/audio/voices/you_lose.ogg',
  },
  pbr: {
    boardInterior: '/assets/pbr/game_board/wood_table_001',  // _diff_4k.jpg, _disp_4k.png, ...
    boardHomeRow:  '/assets/pbr/game_board/WoodFloor008',
    redPiece:      '/assets/pbr/red_piece/Wood008_1K-PNG',
    whitePiece:    '/assets/pbr/white_piece/Wood031_1K-PNG',
  },
  fonts: {
    body:   '/assets/fonts/body/Lato-Regular.ttf',
    header: '/assets/fonts/headers/AbrilFatface-Regular.ttf',
  },
  // game.db is loaded by src/persistence/sqlite/ on first run, not via this manifest.
} as const;
```

Loading is funnelled through drei's `useTexture` and `useLoader` for textures + HDRI. Audio files load on first user interaction (browser autoplay policy). Fonts declare via CSS `@font-face` in `app/css/fonts.css`.

The asset manifest is the **only** layer that references string paths. Components import from `ASSETS.*` — never typing literals.

## Save / resume

The sim broker owns `saveMatchProgress` and `resumeMatch`. Save serialises:

- Engine state (board occupancy + turn + chain, derivable to the canonical position hash)
- AI state via `dumpAiState()` (opaque BLOB, format-versioned — see `docs/AI.md`)
- Move history rows (already streamed to db on each move)

Resume rehydrates the engine from the latest match row + the AI from `loadAiState(blob)`. The koota world is rebuilt from those; render subscribes; play continues at the next legal action. See `docs/DB.md` for table schemas.

## Build + native shell

- Vite (root: project root, dev server, asset handling).
- TypeScript 6.0+ in strict mode (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
- Capacitor 8 wraps the built `dist/` as iOS + Android. `pnpm build:native` produces a Capacitor-ready bundle; `pnpm cap:sync` copies into `android/` and `ios/`.
- `scripts/build-game-db.mjs` runs as `prebuild` and produces `public/game.db` from drizzle migrations + seed data.
- iOS: SwiftPM (Capacitor 8). No CocoaPods.
- Android: Gradle, Java 21 (Temurin), AAB + APK targets.

The web build is the canonical artefact. Capacitor sync is mechanical.

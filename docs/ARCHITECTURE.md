---
title: Architecture
updated: 2026-04-30
status: current
domain: technical
---

# Architecture

## Top-level boundaries

```
Input (raycaster on board plane + pieces; SVG overlay pointer events for diegetic affordances)
    │
    ▼
Sim broker (src/sim/) ──── coordinates engine + ai + store + persistence
    │
    ├─► Engine    (src/engine/)   pure rules, deterministic, no IO
    ├─► AI        (src/ai/)       Yuka Graph + alpha-beta minimax, deterministic, no PRNG
    ├─► Store     (src/store/)    typed CRUD over db tables
    ├─► Analytics (src/analytics/) materialised aggregate queries
    │
    ├─► Scene    (src/scene/)     three.js scene + gsap tweens + diegetic SVG overlays — subscribes to koota
    │
    └─► Audio bus (src/audio/)    dispatched by scene event handlers on Match.lastMove + ceremony phase + winner transitions

Persistence:
    ├─► Capacitor Preferences  (src/persistence/)  typed JSON kv  — settings, last-camera-angle, profile pair, audio volume
    └─► SQLite via Capacitor   (src/persistence/sqlite/) drizzle ORM — match history, AI dumps, analytics aggregates
```

State flows through the sim broker. The scene subscribes to koota traits; it never mutates state directly. The broker is the only module that imports from both the logic side (engine/ai/store) and the IO side (persistence/db/audio).

## Everything is `src/`

There is **no `app/` directory**. There is no React, no JSX, no R3F, no Radix, no framer-motion in the application. The full stack is:

| Concern | Library | Why |
|---|---|---|
| 3D rendering | `three` (pinned `^0.184.0`) | The scene IS the application. |
| Animation (3D + 2D SVG) | `gsap` | Free since the Webflow acquisition; framework-agnostic; animates any JS object property — meshes, cameras, SVG attrs. |
| Diegetic UI overlays | vanilla SVG | Positioned each frame via `camera.project()` of the relevant mesh's world position. No reconciler, no JSX-children walking. |
| State (in-memory) | `koota` (ECS) | Match state as traits on a singleton match entity. |
| Persistence | drizzle ORM + `@capacitor-community/sqlite` + `@capacitor/preferences` | Match history, AI dumps, settings. |
| Audio | `howler` | Through the existing `AudioBus`. |
| Native shell | `@capacitor/*` | iOS + Android wrap. |
| Build | `vite` | Same as before. |
| Test | `playwright` (E2E + golden) + `vitest` (node + browser) | Same as before. |

Provable rules:

| Rule | How it's enforced |
|---|---|
| All code is in `src/` (plus `index.html` + `scripts/` + `drizzle/` + `e2e/`) | grep — no `app/` directory exists |
| No React imports anywhere in the project | biome rule + lint |
| No R3F / Radix / framer-motion imports anywhere | biome rule + lint |
| `src/engine/*` never imports `src/ai/*`, `src/sim/*`, `src/store/*`, or `src/scene/*` | lint + audited at PR review |
| `src/ai/*` imports only from `src/engine/*` (one-way) | same |
| `src/persistence/preferences/*` is a leaf — imports nothing from other `src/` packages | same |
| `src/persistence/sqlite/*` imports only the drizzle / capacitor / better-sqlite3 deps it needs; nothing from `src/{engine,ai,sim,store,scene}/` | same |
| `src/store/*` imports from `src/persistence/sqlite/*` for drizzle handles; type-only from `src/{engine,ai}/*` | same |
| `src/sim/*` is the broker — imports from `src/{engine,ai,store,persistence,audio}/*` | same |
| `src/scene/*` imports from `src/{sim,audio,design,utils}/*` only — type-only from `src/{engine,ai}/*` | same |
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
| `src/design/` | Design tokens (colours, motion durations, typography). Pure TS. No React, no Radix theme — tokens are consumed directly by the scene + by the SVG overlays. | Pure TS. |
| `src/utils/` | Pure utilities: coords, type guards, asserts, asset manifest. | Pure TS. |
| `src/scene/` | Three.js scene + gsap tweens + diegetic SVG overlays. Owns the canvas, the renderer loop, the camera, the lighting, the board, the pieces, the coin flip, the splitting radials, and every diegetic UI surface (lobby Play/Resume on demo pieces, pause radial, end-game radial). Subscribes to koota; never mutates state directly. | See `src/scene/README.md`. |

`src/scene/` is itself organised by concern:

| File | Owns |
|---|---|
| `src/scene/index.ts` | Boot: mounts `<canvas>` + `<div id="overlay">` from `index.html`; constructs scene, camera, renderer, GSAP ticker integration; subscribes to koota; runs the rAF loop. |
| `src/scene/board.ts` | The 9×11 wood surface — interior playfield mesh (`WoodFloor007` PBR) + home-row meshes (`WoodFloor008` PBR), engraved gridlines, bezel frame. |
| `src/scene/pieces.ts` | Stack rendering: a `THREE.Group` per cell, each holding N puck meshes. Top puck carries the dominant owner's wood. |
| `src/scene/lighting.ts` | HDRI environment (`background.exr`) + key/fill/rim directional lights + shadow setup. |
| `src/scene/camera.ts` | The tilted "sitting at the table" camera + the `TippingBoard`-equivalent X-axis tip toward whoever owns the turn (driven by gsap). |
| `src/scene/coinFlip.ts` | The 3D coin: spawn, GSAP-tween spin, land, owner assignment. |
| `src/scene/input.ts` | Raycaster against the board plane + pieces; pointer-down/move/up routing. |
| `src/scene/overlay/` | Diegetic SVG overlays positioned per-frame via `camera.project()` of a piece's world position. Subdirectories per surface: `splitRadial.ts`, `lobbyAffordances.ts` (Play / Resume on demo pieces), `pauseRadial.ts`, `endGameRadial.ts`. |
| `src/scene/animations.ts` | GSAP tween factories for piece moves (lift / arc / settle), splits (detach / follow pointer), board tip, coin spin, radial open/close. Reduced-motion variants live here too. |

## State management

`koota` (entity-component-system) is the single in-memory state container. Match state — board occupancy, current turn, active split chain, AI think-state — lives as koota traits on a singleton match entity. The scene subscribes to traits via koota's vanilla (non-React) subscription API. The sim broker mutates traits as the engine and AI return new states.

Persistence is *not* in koota. The koota world is rebuilt on app boot (or on match resume) from the database — the database is durable; koota is the in-memory working set.

## Scene composition

The scene graph at runtime:

```
THREE.Scene
├─ HDRI environment (image-based lighting from background.exr)
├─ THREE.DirectionalLight × 3  // key, fill, rim — shadow-casting on key
├─ bezel group                  // dark-wood cabinet frame around the board
├─ board group
│  ├─ interior playfield mesh   // rows 1–9, WoodFloor007 PBR, engraved gridlines
│  ├─ home-row mesh × 2         // row 0 + row 10, WoodFloor008 PBR
│  └─ board base (sub-floor)
├─ pieces group
│  └─ stack group × N           // one per occupied cell; each holds the puck meshes for that stack
├─ transient overlays
│  ├─ selection ring            // pulsing emissive ring at the selected cell
│  ├─ valid-move markers        // glow tiles at legal target cells
│  ├─ moving-piece group        // meshes mid-tween between source and target
│  ├─ split arm bar             // vertical sub-stack arm dots while a split is being composed
│  └─ coin                      // present only during the coin-flip ceremony
└─ camera (the "sitting at the table" perspective; tipped per-turn by gsap)
```

A parallel DOM tree, NOT inside the canvas:

```
<div id="overlay">                           // pointer-events: none by default
  <svg class="split-radial" data-piece-id>   // pointer-events: auto on slices; positioned by camera.project()
  <svg class="lobby-affordance" data-puck>   // Play / Resume sit on the demo pieces in the lobby
  <svg class="pause-radial">                 // appears on the centre cell when the player pauses
  <svg class="endgame-radial">               // Play Again / Quit on the winning stack
</div>
```

Each SVG's `transform: translate(...)` is updated in the rAF loop from `camera.project(piece.getWorldPosition())`. There is no React reconciler, no JSX subtree walked by R3F — the SVG elements are appended to the DOM via `document.createElementNS` / direct DOM ops once, then their transforms are mutated each frame.

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
    boardInterior: '/assets/pbr/game_board_main/WoodFloor007',  // _diff_*.png, _disp_*.png, _nor_*.png, _rough_*.png, _ao_*.png
    boardHomeRow:  '/assets/pbr/game_board_home/WoodFloor008',
    redPiece:      '/assets/pbr/red_piece/Wood008',
    whitePiece:    '/assets/pbr/white_piece/Wood031',
    bezel:         '/assets/pbr/bezel/<set>',
  },
  fonts: {
    body:   '/assets/fonts/body/Lato-Regular.ttf',
    header: '/assets/fonts/headers/AbrilFatface-Regular.ttf',
  },
  // game.db is loaded by src/persistence/sqlite/ on first run, not via this manifest.
} as const;
```

Textures load through `THREE.TextureLoader` + `RGBELoader`/`EXRLoader` for the HDRI, all funnelled through one promise so the boot path waits on a single `Promise.all`. Audio loads lazily on first user interaction (browser autoplay policy). Fonts install at boot via a small helper that writes `@font-face` rules into a single `<style>` element from `ASSETS.fonts.*` (BASE_URL-aware).

The asset manifest is the **only** layer that references string paths. Modules import from `ASSETS.*` — never typing literals.

## Save / resume

The sim broker owns `saveMatchProgress` and `resumeMatch`. Save serialises:

- Engine state (board occupancy + turn + chain, derivable to the canonical position hash)
- AI state via `dumpAiState()` (opaque BLOB, format-versioned — see `docs/AI.md`)
- Move history rows (already streamed to db on each move)

Resume rehydrates the engine from the latest match row + the AI from `loadAiState(blob)`. The koota world is rebuilt from those; the scene re-subscribes; play continues at the next legal action. See `docs/DB.md` for table schemas.

## Build + native shell

- Vite (root: project root, dev server, asset handling). Single entry point: `index.html` → `src/scene/index.ts`.
- TypeScript 6.0+ in strict mode (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
- Capacitor 8 wraps the built `dist/` as iOS + Android. `pnpm build:native` produces a Capacitor-ready bundle; `pnpm cap:sync` copies into `android/` and `ios/`.
- `scripts/build-game-db.mjs` runs as `prebuild` and produces `public/game.db` from drizzle migrations + seed data.
- iOS: SwiftPM (Capacitor 8). No CocoaPods.
- Android: Gradle, Java 21 (Temurin), AAB + APK targets.

The web build is the canonical artefact. Capacitor sync is mechanical.

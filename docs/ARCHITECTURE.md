---
title: Architecture
updated: 2026-04-29
status: current
domain: technical
---

# Architecture

## System overview

Chonkers is a TypeScript + R3F + Radix + framer-motion app, shelled by Capacitor for iOS/Android. The top-level boundaries:

```
Input (pointer/touch + radial overlay)
    │
    ▼
Game state (immutable reducer + Zustand store)
    │
    ├─► R3F render tree    (board, pieces, overlay anchor)
    │
    ├─► Radix UI shell     (title, modals, settings, scoreboard)
    │
    └─► Audio bus          (move / chonk / split / sting / voice)
            │
            └─► Persistence (Capacitor Preferences for settings, SQLite for match history)
```

State flows one direction: `reducer(state, action) → state`. Render trees subscribe; they never mutate state directly.

---

## Module boundaries

| Directory | Responsibility | Key files |
|-----------|---------------|-----------|
| `src/app/` | Root composition, Suspense boundaries, error boundary, route shell | `App.tsx`, `main.tsx`, `Boot.tsx` |
| `src/game/` | Pure game logic (no JSX): rules engine, move generation, win check, split-chain state machine | `gameState.ts`, `moves.ts`, `splitChain.ts`, `winCheck.ts`, `initialState.ts` |
| `src/render/` | R3F components — board, pieces, lighting, environment, overlay anchor | `Board.tsx`, `Piece.tsx`, `Stack.tsx`, `Lighting.tsx`, `Environment.tsx` |
| `src/ui/` | React + Radix UI shell — title, settings, pause, win/lose, in-game HUD | `TitleScreen.tsx`, `Hud.tsx`, `WinScreen.tsx`, `LoseScreen.tsx`, `Settings.tsx` |
| `src/ui/split/` | The radial split overlay (SVG + framer-motion + pointer-event state machine) | `SplitOverlay.tsx`, `useSplitController.ts`, `splitGeometry.ts` |
| `src/input/` | Unified pointer/touch handling, hold-timer, drag-tracking | `usePointer.ts`, `useHoldTimer.ts`, `useDragTracker.ts` |
| `src/audio/` | Single AudioBus, role → file map, mute/volume preference | `audioBus.ts`, `roles.ts` |
| `src/persistence/` | Capacitor Preferences for settings, SQLite for match history | `prefs.ts`, `db.ts`, `schema.ts` |
| `src/design/` | Design tokens, typography, Radix theme config | `tokens.ts`, `typography.ts`, `theme.ts` |
| `src/utils/` | Pure utilities — coords, math, type guards | `coords.ts`, `math.ts`, `assert.ts` |
| `src/test/` | Vitest setup files (node + browser) | `setup.ts` |

Hard rules:
- `src/game/` imports nothing from `src/render/`, `src/ui/`, or `src/input/`. It is pure TS — testable in node with no DOM.
- `src/render/` imports from `src/game/` (state types) and `src/design/` (tokens). It does not import from `src/ui/`.
- `src/ui/` may import from `src/game/` (state read), `src/design/`, and `src/audio/`. It does not import from `src/render/`.
- `src/audio/` is a leaf — it imports nothing from `src/game/`. Audio is dispatched as side-effects from the reducer middleware.

---

## Game state

`src/game/gameState.ts` defines the canonical immutable shape:

```ts
type Color = 'red' | 'white';

interface Piece {
  readonly color: Color;
}

// A stack is bottom-up: stack[0] is the bottom puck, stack[stack.length - 1] is the top.
type Stack = ReadonlyArray<Piece>;

// 9 columns × 11 rows. A null cell is empty.
type Board = ReadonlyArray<ReadonlyArray<Stack | null>>;

interface SplitChain {
  readonly source: { col: number; row: number };
  readonly remainingDetachments: ReadonlyArray<ReadonlyArray<number>>; // each inner array = a contiguous run of stack indices
}

interface GameState {
  readonly board: Board;
  readonly turn: Color;
  readonly chain: SplitChain | null;   // non-null forces the next move to continue the chain
  readonly winner: Color | null;
}
```

Mutations go through a single reducer:

```ts
type Action =
  | { type: 'move';  from: Cell; to: Cell }
  | { type: 'split'; from: Cell; to: Cell; sliceIndices: ReadonlyArray<number> };

function reduce(state: GameState, action: Action): GameState;
```

The reducer:
1. Validates the action against §4 / §5 of `RULES.md`. Invalid actions throw — the UI is responsible for never dispatching one.
2. Applies the move/split.
3. Runs the win check.
4. Returns a new state.

A thin Zustand store (`src/game/store.ts`) wraps the reducer for React consumption + middleware (audio, persistence).

---

## R3F scene tree

```
<Canvas shadows dpr={[1, 2]}>
  <Environment files="/assets/hdri/background.exr" background blur={0.4} />
  <Lighting />                               // key + fill + rim
  <Board />                                  // 9×11 mesh, wood PBR, engraved gridlines
  <HomeRowGradient />                        // shader overlay on rows 0 + 10
  <StackGroup>                               // one <Stack> per non-empty cell
    <Stack col row stack />                  // N <Piece> stacked vertically
  </StackGroup>
  <SelectionRing />                          // selected cell glow
  <ValidMoveMarkers />                       // dots on legal destinations
  <SplitOverlayAnchor />                     // 3D position → 2D screen-projection sink
</Canvas>
<SplitOverlay />                             // SVG, html-layered above canvas
<Hud />                                      // Radix UI HUD
```

The SplitOverlay is **outside** `<Canvas>` — it is HTML/SVG. An anchor inside the canvas continuously projects the active stack's world position to screen-space and writes it to a Zustand atom; the overlay reads the atom and positions itself with CSS `transform`.

---

## Asset loading

All assets live under `public/assets/` and are addressed by a strict roles map:

```ts
// src/assets/manifest.ts
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
    board:    '/assets/pbr/game_board/wood_table_001',     // suffixed _diff_4k.jpg, _disp_4k.png, ...
    redPiece: '/assets/pbr/red_piece/Wood008_1K-PNG',
    whitePiece: '/assets/pbr/white_piece/Wood031_1K-PNG',
  },
  fonts: {
    body:   '/assets/fonts/body/Lato-Regular.ttf',
    header: '/assets/fonts/headers/AbrilFatface-Regular.ttf',
  },
} as const;
```

Loading is funnelled through `@react-three/drei`'s `useTexture` and `useLoader` for textures + HDRI; audio files are loaded by the AudioBus on first user interaction (browser autoplay policy). Fonts are declared via CSS `@font-face` in `src/css/fonts.css`.

The asset manifest is the **only** layer that references string paths. Components import from `ASSETS.*` — never typing literals.

---

## Persistence

Two independent stores:

| Store | Backend | Purpose |
|-------|---------|---------|
| Settings | `@capacitor/preferences` | volume, mute, reduced-motion override, last-camera-angle |
| Match history | `@capacitor-community/sqlite` (via `jeep-sqlite` shim on web) | recent matches, win counts, optional replay frames |

Settings load synchronously at boot (Capacitor Preferences is fast). Match history loads lazily — the title screen renders before SQLite is ready.

There is **no** localStorage backing. Web builds use `jeep-sqlite` (sql.js under the hood); native builds use the platform SQLite plugin.

---

## Build + native shell

- Vite (root: `src/`, dev server, asset handling).
- TypeScript 6.0.2+ in strict mode (`"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`).
- Capacitor 8 wraps the built `dist/` as iOS + Android. `pnpm build:native` produces a Capacitor-ready bundle; `pnpm cap:sync` copies into `android/` and `ios/`.
- The web build is the canonical artifact. Capacitor sync is mechanical.
- iOS: SwiftPM (Capacitor 8). No CocoaPods.
- Android: Gradle, Java 21 (Temurin), AAB + APK targets.

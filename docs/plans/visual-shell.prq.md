# PRD: app/ — visual shell (R3F + Radix + framer-motion + input pipeline)

**Created:** 2026-04-29
**Status:** ACTIVE
**Owner:** jbogaty
**Acceptance:** A player can launch the dev server, see the 3D wood board with the 5-4-3 starting position, configure a new game (difficulty / disposition / colour), watch the AI move, select pieces, see legal-move highlights, move/chonk/split a piece via gestures with audio + animation, win or lose, see the win/lose screen with voice playback. All `app/*.tsx` consumes koota traits via reactive hooks; `src/*` stays pure TypeScript.

**Prerequisites:**
- [persistence.prq.md](./persistence.prq.md) merged
- [schema.prq.md](./schema.prq.md) merged
- [logic-surfaces-and-broker.prq.md](./logic-surfaces-and-broker.prq.md) merged
- [audio-and-design-tokens.prq.md](./audio-and-design-tokens.prq.md) merged

---

## Why this is its own PRD

`app/` is the entire React + R3F + Radix + framer-motion surface. It's large enough that splitting render from input from screens from boot would create artificial seams; small enough that one PRD captures it cleanly.

The PRD's discipline is strict: **`app/*` consumes the sim layer's actions + traits; it never reaches into engine/ai/store directly.** The koota world bootstrapped by `src/sim/` is the only data source. `useTrait`/`useQuery` from `koota/react` are the only read primitives. `useActions` is the only write primitive.

Visual decisions (camera angle, lighting setup, gridline rendering, split-overlay UX) live here. Game logic does not.

---

## Goal

Land:

1. **Entry + boot** — `app/main.tsx`, `app/App.tsx` (screen router reading `Screen` trait), `app/boot/` (one-time init: kv settings load, audio bus init, schema bootstrap, Capacitor App lifecycle hooks, ErrorBoundary).
2. **R3F canvas** — `app/canvas/Scene.tsx`, `Board.tsx` (two-wood mesh), `Pieces.tsx` (queries pieces; renders `Piece.tsx` per entity), `SelectionRing.tsx`, `ValidMoveMarkers.tsx`, `DraggingSubStack.tsx`, `SplitOverlayAnchor.tsx` (3D→screen-coords projection), `Lighting.tsx`, `Environment.tsx` (HDRI). `DecisionTopography.tsx` (DEV-only debug overlay, gated behind a dev-tools toggle).
3. **Input pipeline** — `app/input/usePointer.ts`, `useHoldTimer.ts` (3000ms arm), `useDragTracker.ts` (8px commit threshold), `useRaycastCell.ts` (screen→cell math), `intent.ts` (typed Intent union: SelectCell / ToggleSlice / ArmSplit / CommitDrag / DropOnCell / Cancel). The pipeline produces Intents; an `useIntentDispatcher` hook routes them into sim actions.
4. **Radix screens** — `app/screens/TitleView.tsx` (difficulty + disposition + colour selectors → newMatch), `PlayView.tsx` (wraps Scene + HUD + SplitOverlay), `WinView.tsx` (sting → voice → Play again / Main menu), `LoseView.tsx` (mirror), `PauseView.tsx` (Resume / Settings / Main menu; wired to Capacitor App pause hook), `SettingsView.tsx` (volume + mute + reduced-motion + haptics + default difficulty/disposition).
5. **Components** — `app/components/PrimaryButton.tsx`, `ToggleRow.tsx`, `ScrimDialog.tsx`, `TurnBadge.tsx`, `DifficultyRadio.tsx`, `DispositionRadio.tsx`, `ColorRadio.tsx`, `SplitRadial.tsx` (pure SVG component, slice count + selection state + run-coloring + callbacks).
6. **Hooks** — `app/hooks/usePrefs.ts` (Capacitor Preferences via `kv`), `useFrameloop.ts` (ties koota frame systems to R3F's `useFrame`), `usePrefersReducedMotion.ts`.
7. **CSS** — `app/css/fonts.css` (Lato + Abril Fatface @font-face), `app/css/style.css` (reset + CSS variables mirroring tokens + reduced-motion override).
8. **HTML** — `app/index.html` (Vite entry; mounts `#root`; loads global CSS).

---

## Architecture

### Screen routing

```tsx
// app/App.tsx
import { useTrait, useWorld } from 'koota/react';
import { Screen } from '@/sim/traits';
import { TitleView } from '~/screens/TitleView';
import { PlayView } from '~/screens/PlayView';
// ... etc

export function App() {
  const world = useWorld();
  const game = world.queryFirst(Screen);
  const screen = useTrait(game, Screen)?.value ?? 'title';
  
  switch (screen) {
    case 'title':    return <TitleView />;
    case 'play':     return <PlayView />;
    case 'win':      return <WinView />;
    case 'lose':     return <LoseView />;
    case 'paused':   return <PauseView />;
    case 'settings': return <SettingsView />;
  }
}
```

The Screen trait is mutated by sim actions (`newMatch` sets to `'play'`, `quitMatch` sets to `'title'`, win-check effect sets to `'win'`/`'lose'`). React re-renders automatically when the trait changes.

### Input → Intent → Action

The input pipeline is layered:

1. **DOM events** (pointerdown, pointermove, pointerup, pointercancel) on the `<Canvas>` element captured by `usePointer`.
2. **Raycast** to determine target cell via `useRaycastCell` using the active R3F camera + a horizontal plane at y=0.
3. **State machine** in `useIntentDispatcher` interprets pointer events given current sim state:
   - Tap empty cell with no selection → no-op
   - Tap own stack → `setSelection(cell)`
   - Tap empty/legal cell with selection → `dispatchPlayerAction({ from: selection, runs: [{ indices: allIndices, to: cell }] })`
   - Tap own stack with selection on a stack ≥ 2 → `openSplitOverlay(cell)`
   - Inside split overlay: tap slice → `toggleSliceSelection(index)`; press-and-hold 3s → `armSplit()` (haptic fires); drag-after-arm → `commitSplitDrag(currentRunIndex)`; release on cell → `dropRunOnCell(currentRunIndex, cell)`.
4. **Sim actions** are called via `useActions(actions)` from `@/sim`.

The state machine itself lives in `useIntentDispatcher`. Pure-TS pieces (validating which cells are legal destinations, which slices belong to which run) come from `@/engine` and `@/sim` — the hook orchestrates but doesn't decide.

### SplitRadial — pure SVG

```tsx
// app/components/SplitRadial.tsx
import { motion } from 'framer-motion';
import { tokens } from '@/design';
import { radialOpen, sliceSelect, holdFlash } from '@/design/motion';

interface Props {
  height: number;                                  // 2..12
  selection: ReadonlySet<number>;                  // 0..height-1
  runColors: ReadonlyMap<number, string>;          // index → color (per contiguous run)
  holdProgress: number;                            // 0..1
  armed: boolean;
  onSliceTap(index: number): void;
  onHoldStart(): void;
  onHoldEnd(): void;
  onDragStart(): void;
}

export function SplitRadial({ height, selection, runColors, holdProgress, armed, onSliceTap, onHoldStart, onHoldEnd, onDragStart }: Props) {
  // Renders height-count pie slices; each slice is a path with onPointerDown/Up/Move handlers.
  // Selected slices fill with their run color (from runColors map).
  // armed=true triggers holdFlash variant.
  // Drag-after-arm fires onDragStart when displacement > 8px.
  return <motion.svg variants={radialOpen} initial="hidden" animate="visible" /* ... */ />;
}
```

The SplitRadial component is **fully decoupled** from sim — it receives selection state + emits callbacks. The parent (`PlayView`) wires it to sim actions.

### Boot sequence

```tsx
// app/boot/boot.tsx
import { createSimWorld } from '@/sim';
import { getAudioBus } from '@/audio';
import { bootstrapChonkersSchema } from '@/schema';
import { kv } from '@/persistence';
import { App as Capacitor } from '@capacitor/app';

export async function boot() {
  // 1. Schema first (creates DB + tables if needed)
  const dbName = `chonkers-${(await kv.get<string>('settings', 'lastUserId')) ?? 'default'}`;
  const { connection } = await bootstrapChonkersSchema(dbName);

  // 2. Audio bus — preload all Howls
  await getAudioBus().init();

  // 3. Sim world — bootstrap entities + reads settings from kv
  const world = createSimWorld({ db: connection });

  // 4. Capacitor lifecycle — pause sim on background, resume on foreground
  await Capacitor.addListener('appStateChange', ({ isActive }) => {
    const actions = getActions(world);
    if (isActive) actions.resume();
    else actions.pause();
  });

  return world;
}
```

`app/main.tsx` calls `boot()` once, then renders `<WorldProvider world={world}><Theme {...radixTheme}><App /></Theme></WorldProvider>`. ErrorBoundary wraps the whole tree to surface boot failures gracefully.

### useFrameloop

Ties koota's `world.run(systems)` to R3F's `useFrame`:

```tsx
// app/hooks/useFrameloop.ts
import { useFrame } from '@react-three/fiber';
import { useWorld } from 'koota/react';
import { animateTweens } from '@/sim/systems';

export function useFrameloop() {
  const world = useWorld();
  useFrame((_, delta) => {
    animateTweens(world, delta);
  });
}
```

Called from `Scene.tsx` once. The frame loop runs animation tweens (Position trait interpolation, AnimationTween tick) every render frame.

---

## Tasks

### A. Documentation

#### A1. Author `app/README.md`

**Files:** `app/README.md`

**Acceptance criteria:**
- Frontmatter present
- Architecture diagram (text): boot → screen router → screens → canvas/components/input/hooks
- Strict-rules section: `app/*` consumes `@/sim` actions + traits only; never reaches into engine/ai/store/persistence/schema directly

#### A2. Update `docs/ARCHITECTURE.md`

**Files:** `docs/ARCHITECTURE.md`

**Acceptance criteria:**
- Reflects `app/` shape post-PRD
- Documents the strict one-way dep: app → sim → {engine, ai, store, persistence, schema, audio, design}

---

### B. Tests written first (where applicable)

The visual layer's tests are mostly behavioral / visual / e2e. Unit tests focus on the pure-TS logic that lives within hooks (Intent state machine, raycast math, hold-timer behavior). Component-level visual tests live as Vitest browser snapshots; full-flow tests live in PRQ-6 (e2e governor).

#### B1. Write `app/input/__tests__/useHoldTimer.test.tsx`

**Description:** Browser-tier vitest. Asserts: timer fires after 3000ms; cancellation before 3000ms prevents fire; multiple holds in succession reset cleanly; haptic.impact fires on Capacitor platforms (mocked at the Capacitor API boundary, real timer behavior).

**Files:** `app/input/__tests__/useHoldTimer.browser.test.tsx`

**Acceptance criteria:**
- Uses real timers (or vitest fake timers explicitly)
- ≥4 assertions

#### B2. Write `app/input/__tests__/useDragTracker.test.tsx`

**Description:** Browser-tier vitest. Asserts: pointermove with displacement <8px doesn't commit; ≥8px commits; commit fires once per drag; pointercancel resets.

**Files:** `app/input/__tests__/useDragTracker.browser.test.tsx`

**Acceptance criteria:**
- ≥4 assertions

#### B3. Write `app/input/__tests__/useIntentDispatcher.test.tsx`

**Description:** State-machine tests. Constructs a sim world, sets up a known engine state, fires synthetic pointer events through the dispatcher, asserts correct sim actions are called. Uses real `@/sim` actions.

**Files:** `app/input/__tests__/useIntentDispatcher.browser.test.tsx`

**Acceptance criteria:**
- ≥6 distinct event sequences asserted
- Uses real sim, real engine

#### B4. Write `app/canvas/__tests__/Board.browser.test.tsx`

**Description:** Snapshot test for the board mesh: renders Scene with default starting state, captures a screenshot, asserts visual baseline. Tolerance for sub-pixel rendering differences.

**Files:** `app/canvas/__tests__/Board.browser.test.tsx`

**Acceptance criteria:**
- Visual baseline captured
- Subsequent runs match within tolerance

#### B5. Write `app/components/__tests__/SplitRadial.browser.test.tsx`

**Description:** Component tests for SplitRadial. For each height ∈ [2, 6, 8], render with various selection sets, assert correct slice count + correct fill colors per run.

**Files:** `app/components/__tests__/SplitRadial.browser.test.tsx`

**Acceptance criteria:**
- ≥6 distinct render assertions
- Run-coloring verified for {0,1,4} of 6 → two runs with different colors

---

### C. Implementation

#### C1. Author `app/index.html`

**Files:** `app/index.html`

**Acceptance criteria:**
- Mounts `#root`
- Loads `app/main.tsx` as the entry module
- Includes meta viewport for mobile + theme-color
- Links `app/manifest.webmanifest` (already at `public/manifest.webmanifest`)

#### C2. Author `app/css/fonts.css` + `app/css/style.css`

**Files:** `app/css/fonts.css`, `app/css/style.css`

**Acceptance criteria:**
- fonts.css declares all Lato weights + Abril Fatface
- style.css mirrors tokens as CSS custom properties (`--ck-*`)
- Reduced-motion override flattens animation/transition durations

#### C3. Implement `app/boot/boot.tsx` + `app/boot/ErrorBoundary.tsx`

**Files:** `app/boot/boot.tsx`, `app/boot/ErrorBoundary.tsx`

**Acceptance criteria:**
- boot() returns a ready koota world
- Capacitor App lifecycle hooks wired
- ErrorBoundary catches boot + render errors with a recovery UI

#### C4. Implement `app/main.tsx` + `app/App.tsx`

**Files:** `app/main.tsx`, `app/App.tsx`

**Acceptance criteria:**
- main.tsx calls boot(), renders WorldProvider + Theme + ErrorBoundary + App
- App.tsx is a screen router reading the Screen trait

#### C5. Implement `app/canvas/` files

**Files:** `app/canvas/{Scene,Board,Lighting,Environment,Pieces,Piece,Stack,SelectionRing,ValidMoveMarkers,DraggingSubStack,SplitOverlayAnchor,DecisionTopography}.tsx`, `app/canvas/index.ts`

**Acceptance criteria:**
- Scene wraps `<Canvas>` with shadows, dpr, perspective camera, environment, lighting
- Board renders the two-wood-region mesh with engraved gridlines
- Pieces queries [Position, Owner], renders one Piece per entity
- Piece subscribes via useTrait — only re-renders when its own traits change
- SelectionRing renders only when Selection trait is non-null
- ValidMoveMarkers reads selected cell + computes legal destinations via @/engine.enumerateLegalRuns
- DraggingSubStack renders during drag-after-arm; tracks pointer position
- SplitOverlayAnchor projects 3D position to screen px and writes to a koota trait
- DecisionTopography is dev-only (gated by `import.meta.env.DEV` AND a debug-overlay flag in dev tools)
- B4 test passes

#### C6. Implement `app/input/` files

**Files:** `app/input/{usePointer,useHoldTimer,useDragTracker,useRaycastCell,useIntentDispatcher,intent}.ts`, `app/input/index.ts`

**Acceptance criteria:**
- B1 + B2 + B3 tests pass
- Intent type union exported
- All hooks use stable references (useCallback / useMemo correctly)

#### C7. Implement `app/hooks/` files

**Files:** `app/hooks/{usePrefs,useFrameloop,usePrefersReducedMotion}.ts`, `app/hooks/index.ts`

**Acceptance criteria:**
- usePrefs reads + writes via kv on mount/change
- useFrameloop ties koota systems to useFrame
- usePrefersReducedMotion checks both CSS media query AND kv setting

#### C8. Implement `app/components/` files

**Files:** `app/components/{PrimaryButton,ToggleRow,ScrimDialog,TurnBadge,DifficultyRadio,DispositionRadio,ColorRadio,SplitRadial}.tsx`, `app/components/index.ts`

**Acceptance criteria:**
- B5 test passes
- All components use Radix primitives where applicable
- All components consume tokens from `@/design`
- No business logic in components — they receive props + emit callbacks

#### C9. Implement `app/screens/` files

**Files:** `app/screens/{TitleView,PlayView,WinView,LoseView,PauseView,SettingsView}.tsx`, `app/screens/index.ts`

**Acceptance criteria:**
- TitleView: three radios (difficulty/disposition/colour) with defaults from kv; Start button calls newMatch action
- PlayView: wraps Scene + HUD (TurnBadge) + SplitOverlay (when active); reads Match trait for turn/winner
- WinView/LoseView: plays sting then voice; Play again calls newMatch with prior config; Main menu calls goToTitle
- PauseView: Resume/Settings/Main menu wired to actions
- SettingsView: all six settings persist via usePrefs

---

### D. Verification

#### D1. Manual playthrough

**Description:** Run `pnpm dev`, complete a full match against the AI, win and play again.

**Files:** none — process step

**Acceptance criteria:**
- Dev server boots without errors
- Full match plays through (open title → start → make moves → AI responds → win/lose → play again)
- Audio fires on appropriate events
- Animations play smoothly
- No console errors during play

#### D2. Browser tier test suite

**Files:** none

**Acceptance criteria:**
- `pnpm test:browser app` passes
- ≤2min runtime
- 5 consecutive clean runs

#### D3. Build verification

**Files:** none

**Acceptance criteria:**
- `pnpm build` produces a clean dist/
- Bundle size acceptable (no regressions)
- No `from 'react'` or `from 'react-dom'` outside `app/**`
- No `from '@/engine'` or similar in `app/canvas` or `app/components` (those go through sim)

---

## Execution order

```text
A1, A2 (docs in parallel; no code deps)
   ↓
B1, B2, B3, B4, B5 (test files in parallel — written before their impls)
   ↓
C1, C2 (HTML + CSS — independent of TSX impls; can land early)
C3 (boot + ErrorBoundary — depends on src/sim, src/audio, src/schema, src/persistence)
   ↓
C4 (main.tsx + App.tsx — depends on C3)
C5 (canvas/ — Scene + Board + Pieces + Piece + supporting; depends on B4 test passing once impl lands)
C6 (input/ — depends on B1, B2, B3 tests passing)
C7 (hooks/ — independent; can land in parallel with C5/C6)
C8 (components/ — depends on B5; uses tokens from @/design)
   ↓
C9 (screens/ — depends on C4-C8; the integration of all sub-layers)
   ↓
D1 (manual playthrough — gates everything below)
   ↓
D2 (browser test suite green) ‖ D3 (build verification)
```
The execution graph mirrors the structure of `schema.prq.md` and `audio-and-design-tokens.prq.md` for consistency. Within each phase, items can run in parallel; the `↓` separator enforces strict ordering between phases.

---

## Configuration

```yaml
batch_name: chonkers-visual-shell
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1
```

---

## Risks

- **Visual snapshot brittleness.** Pixel-exact comparison is too strict for browser-tier render tests; tolerance windows are too lenient. Mitigated by: keeping snapshot tests scoped to "does the board render at all + does Pieces query produce the right entity count" rather than pixel diffs.
- **R3F + koota integration friction.** First time wiring useFrame to koota systems. May need to switch to a manual rAF loop if useFrame's timing doesn't suit the animation tween system. Documented as fallback.
- **Capacitor App lifecycle in dev (web).** The `appStateChange` event fires only on native; web uses Page Visibility API. Mitigated by `usePageVisibility` hook that translates web visibility events to the same pause/resume actions.
- **Reduced-motion in production.** Browser CSS media query is the canonical signal; kv setting is an in-app override. Both must be honored. Test covers both.

---

## Definition of Done

- All A* docs merged.
- All B* tests merged + demonstrated red.
- All C* implementations merged.
- D1 manual playthrough successful.
- D2 + D3 verifications pass.
- A new player can `pnpm install && pnpm dev` and play a complete game in under 30 seconds.

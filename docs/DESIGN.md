---
title: Design
updated: 2026-04-30
status: current
domain: product
---

# Design

## What the game is

**Chonkers** is a 3D tabletop strategy game — checkers reimagined around stacking instead of capture. You don't remove your opponent's pieces; you **chonk** them, climbing on top to take dominant control of a tower. Once you're elevated, you carry the stack forward toward the opponent's home row.

Camera sits at the table — tilted, slightly down, the way a player leaning over a real wood board would see the position.

Tagline: **Stack. Don't capture.**

## What the game is NOT

- Not classical checkers. There is no jumping, double-jumping, kinging, or capture-removal.
- Not procedurally generated. Every surface — board wood, piece wood, HDRI, audio, fonts — is curated and committed.
- Not desktop-first. The split UI is mobile-native (touch, hold, vibrate, drag). Desktop mouse is a downgraded path.
- Not skinned chess. The legal-move set, the height restriction, and the split mechanic are the game.

---

## Brand pillars

### 1. Tactile wood
The board and pieces read as **real wood, on a real table**. Two distinct PBR woods (oak-light vs walnut-dark) for the two players, against a third (warm hardwood) for the board. No flat fills, no plastic gradients.

### 2. Stacks are the game
The 3D view exists so the player can read stack height at a glance. Camera, lighting, and shadowing all serve "how tall is that tower, and who owns the top."

### 3. Mobile-native, no compromise
The split mechanic — tap segments, hold three seconds, feel a haptic, drag to commit — is designed for a thumb on a 5–6" screen. Every interaction works under that constraint first; mouse + keyboard inherit the same affordances.

---

## Visual identity

### Palette (locked — do not drift)

The palette is **derived from the curated PBR textures** in `public/assets/pbr/`. The hex values below are token names; their canonical source is the wood diffuse maps. UI ink and surfaces are tuned to read against the wood without competing with it.

| Token | Hex | Use |
|-------|-----|-----|
| `wood.boardMain` | `#8C5A2B` | Interior playfield wood — `WoodFloor007` mid-tone |
| `wood.boardHome` | `#5A3818` | Home-row wood — `WoodFloor008` mid-tone (deeper, contrasts the playfield) |
| `wood.piece.red` | `#7A3B22` | Player one — Wood008 (walnut-warm) mid-tone |
| `wood.piece.white` | `#D6BC8A` | Player two — Wood031 (oak-light) mid-tone |
| `ink.primary` | `#1B1410` | Body text on light surfaces |
| `ink.inverse` | `#F5EBD8` | Body text on wood / dark surfaces |
| `accent.select` | `#E8B83A` | Piece selection ring, valid-move highlight |
| `accent.danger` | `#C0392B` | Game-over flash, illegal-move shake |
| `accent.split` | `#3FB67A` | Split-segment flash on hold-ready |
| `surface.scrim` | `rgba(15, 10, 5, 0.72)` | Modal backdrop, pause overlay |

The `splitRadial.*` sub-tree adds slice-state colours (idle, hovered, selected, hold-ready, committed-opacity) used by the splitting radial in `src/scene/overlay/splitRadial.ts`. The `turnBadge.*` sub-tree adds red/white colour banding for the diegetic turn indicator (a small wood pip on the bezel that lights for the active player). These all reference the same wood/ink/accent base colours so the palette stays cohesive.

Tokens are defined in `src/design/tokens.ts` (one `tokens as const` export). The scene reads them directly when constructing materials and when generating SVG overlay markup. There is no Radix theme bridge and no CSS custom-property mirror — the tokens module is the single source.

### Typography

- **Abril Fatface** (SIL OFL 1.1) — display, title, big numbers, win/lose stings
  - File: `public/assets/fonts/headers/AbrilFatface-Regular.ttf`
- **Lato** (SIL OFL 1.1) — UI, labels, settings, body copy, tutorial text
  - Files: `public/assets/fonts/body/Lato-{Thin,Light,Regular,Bold,Black}{,Italic}.ttf`

No substitutes. Fonts are self-hosted under `public/assets/fonts/` — never CDN-loaded.

### UI vocabulary

| Game concept | In-world label |
|--------------|---------------|
| Capture | Chonk |
| Tower height | Stack |
| Dominant ownership | Top of stack |
| Split-off sub-stack | Slice |
| Goal-row | Home Row |

---

## The board as hero surface

The 9×11 board with engraved gridlines is the game's signature shot. Design constraints:

- Board geometry is composed of two distinct wood regions:
  - **Interior playfield** (rows 1–9) — `WoodFloor007` PBR set (diffuse, normal, roughness, displacement, AO).
  - **Home rows** (row 0 and row 10) — `WoodFloor008` PBR set (diffuse, normal, roughness, displacement). Visually a deeper, more closed wood grain so the home rows read as a distinct band the player is pushing toward, without any colour gradient or shader overlay.
- Gridlines are inset/engraved geometry, not painted-on — they catch shadow under raking light.
- Camera default: tilted ~40° down, ~15° yaw offset to read stacks asymmetrically.
- HDRI: `public/assets/hdri/background.exr` provides physically-based lighting and the ambient sky reflection on board lacquer.

---

## The pieces

- 12 per side. No more.
- Initial layout: 5-4-3 triangular formation on the rows closest to each player's home row, leaving the centre row (row 6) and the home rows themselves empty at start.
- Pieces are short cylinders (puck shape) — `radius : height ≈ 1 : 0.4`.
- Per-player wood: red player uses Wood008 (`public/assets/pbr/red_piece/`), white player uses Wood031 (`public/assets/pbr/white_piece/`).
- A stack is rendered as N pucks aligned vertically with a fractional gap so the wood seam reads from camera distance. Z-fighting is prevented by snapping each puck's Y to a discrete level.
- The **top** puck of a stack always shows the dominant owner's wood. Sub-pucks below show their original owners' wood — visual continuity with what was chonked under whom.

---

## Diegetic UI — every affordance lives on a piece

There are no floating buttons, no full-screen menus, no Radix dialogs. **Every interactive surface is a diegetic SVG overlay positioned above a piece on the board** — the affordance is *attached* to the wood the player is looking at.

The shared mechanism: the scene's rAF loop calls `camera.project(piece.getWorldPosition())` for each visible affordance and writes the resulting screen-space coordinate to the SVG element's `transform: translate(...)`. The SVG is regular DOM (not inside the canvas, not inside a custom reconciler) appended to `<div id="overlay">` once at boot. Pointer events on slice paths fire native DOM handlers; hit-testing is exact and crisp.

Animation is driven by `gsap` for both the 3D pieces (mesh transforms, materials, camera) and the 2D SVG overlays (path attributes, opacity, transform). One animation library, one timeline model, one easing vocabulary across the whole app.

### Surfaces

| Surface | Where it sits | What it does |
|---|---|---|
| Lobby Play / Resume | On the two demo pucks resting in the centre of the board at boot | Tap the red puck to start a new match; tap the white puck to resume the saved match (faded if none). |
| Coin flip | The coin itself is a 3D mesh that spawns above the board, spins via gsap, lands on a face. | The landing face decides who plays first. No SVG required. |
| Pause | On the centre cell of the board when the player triple-taps the bezel | Radial: Resume, Settings, Quit. |
| Splitting radial | On the top puck of the selected stack when stack height ≥ 2 | See "The splitting radial" below. |
| Selection ring + valid-move markers | 3D meshes around the selected stack and on legal target cells | Pulsing emissive ring (gsap-driven). |
| End-of-match | On the winning stack's top piece on the home row | Radial: Play Again, Quit. |
| Settings (volume, reduced-motion, etc.) | A radial that opens from the centre cell when reached from Pause | Each slice a toggle. |

### The splitting radial

When the player taps a stack of height ≥ 2, a 2D SVG radial menu appears, centred over the top puck's screen-projected position. SVG is the right tool for slice geometry:

- Slice borders stay crisp at any zoom.
- gsap drives the open/close + slice flash + hold-ready pulse.
- Hit-testing for slice selection is native pointer events, not raycasts.

Slice count = stack height. Players can select up to N − 1 slices (the whole stack ≠ a split). Visual states per slice:

| State | Appearance |
|-------|-----------|
| Idle | Stroked outline, transparent fill |
| Hovered (desktop) | Outline brightens to `accent.select` |
| Selected | Filled with `accent.select` at 0.6 alpha, border bold |
| Hold-ready (after 3s press) | Pulses `accent.split`, vibrates if `Haptics.impact()` is supported |
| Committed (drag started) | Selected slices detach into 3D pucks following the pointer |

---

## Audio

All audio is in `public/assets/audio/` and mapped by role, not file path. The role names are the public contract callers use; the file paths are internal to `src/audio/roles.ts`.

| Role | File | Triggers | Ducks ambient |
|------|------|----------|---------------|
| `ambient` | `ambient/bg_loop.wav` | `audio.startAmbient()` on game-start; loops indefinitely | n/a (the duck target) |
| `move` | `effects/move.ogg` | Any successful piece move (1-stack or full stack) | no |
| `chonk` | `effects/chonk.ogg` | A move landing on a stack of equal-or-greater height | no |
| `split` | `effects/split.ogg` | Player commits a split (drag started after hold-ready) | no |
| `sting` | `effects/game_over_sting.ogg` | Game-over transition; precedes either voice line | yes |
| `win` | `voices/you_win.ogg` | Local player wins | yes |
| `lose` | `voices/you_lose.ogg` | Local player loses | yes |

Audio is wired through a single `AudioBus` (`src/audio/audioBus.ts`) so volume/mute is one source of truth. The bus is an **async lazy singleton** — callers always `const audio = await getAudioBus(); audio.play('chonk');`. Concurrent first-callers converge on the same in-flight promise (no double-init).

Volume + mute persist to `kv` namespace `'settings'` (keys `'volume'` 0..1, `'muted'` boolean), so a player's choice survives reload. Defaults: `volume = 0.7`, `muted = false`.

Ducking: when any role in `STING_ROLES` (`sting`, `win`, `lose`) plays, the bus increments an `activeDucks` counter and fades ambient to 25% of the bus volume over 200ms. When the sting ends (or `stop()` is called), the counter decrements; when it reaches 0, ambient restores over 400ms. Overlapping stings stack correctly — the first sting starts the duck, the last sting to end restores.

Edge: `duckAmbient` early-returns if ambient isn't already playing. So if a sting fires before `startAmbient()` has been called (e.g., a unit-test that exercises only the win sting), the duck is a no-op. The counter still increments + decrements normally; the visible volume just doesn't change. Sequence sims that need ducking active must call `startAmbient()` before the first sting.

---

## Motion

`gsap` owns all motion — 3D mesh transforms, camera moves, SVG overlay attributes, opacity, the lot. One library, one timeline model, one easing vocabulary. Two motion budgets:

- **UI motion** — radial overlay open (160ms ease-out), slice flash (240ms ease-in-out, 2 cycles), pause/end radial in/out (180ms).
- **Piece motion** — lift-arc-drop on move (420ms total: 120ms lift, 200ms arc, 100ms settle bounce). Split-extract is 300ms for the slice-pucks to detach + follow pointer.

The motion vocabulary lives in `src/design/tokens.ts` (durations) and `src/scene/animations.ts` (gsap tween factories). Surfaces import factories by name rather than redeclaring tweens:

| Factory | Where it's used | Duration token |
|---|---|---|
| `tweenRadialOpen(svgEl)` | Splitting / pause / lobby / end-game radials open | `tokens.motion.uiOpenMs` |
| `tweenRadialClose(svgEl)` | Same radials close | `tokens.motion.uiCloseMs` |
| `tweenSliceSelect(sliceEl)` | Slice idle → hovered → selected (80ms ease-out) | hardcoded (one-off) |
| `tweenHoldFlash(sliceEls)` | Selected slices pulse while the hold-arm timer runs | `tokens.motion.uiFlashMs` |
| `tweenPieceMove(meshes, fromXZ, toXZ)` | Lift / arc / settle for a 1-stack or full-stack move | 420ms split across phases |
| `tweenSplitDetach(meshes, pointerStream)` | Selected slice-pucks detach and follow the pointer in worldspace | 300ms detach, then live |
| `tweenBoardTip(camera, towardPlayer)` | The X-axis tip toward whoever owns the turn | `tokens.motion.boardTipMs` |
| `tweenCoinSpin(coin, faceUp)` | Coin spins, decelerates, lands on the chosen face | `tokens.motion.coinSpinMs` |
| `reducedMotion` | Drop-in alternative used by every factory above when reduced-motion is on | 0.001s for UI; 200ms linear translate for pieces |

Reduce-motion users (`prefers-reduced-motion` OR `kv.get('settings', 'reducedMotion')`) get the reduced-motion path automatically — no arcs, no bounces, no hold-flash pulse.

---

## Win condition

The game ends the moment **every top-of-stack** of a single colour sits on the opponent's home row. Sub-stacks below those tops do not need to belong to the winner. If the opponent has no remaining top-of-stack pieces of their own anywhere on the board, that's a forced win for the winner on the same turn.

The win check runs after every move resolves, before the turn flips.

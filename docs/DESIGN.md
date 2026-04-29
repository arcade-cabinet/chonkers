---
title: Design
updated: 2026-04-29
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

These are defined in `src/design/tokens.ts` and exposed to Radix Themes via `accentColor`, plus to CSS as `--ck-*` custom properties. All three sources stay in sync.

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

## The split overlay

When the player taps a stack of height ≥ 2, a 2D SVG radial menu appears, centred over the stack's screen-projected position. The overlay is HTML/SVG layered on top of the R3F canvas — **not** WebGL geometry — so:

- Slice borders stay crisp at any zoom.
- CSS animations drive the flash + pulse.
- Hit-testing for slice selection is native pointer events, not raycasts.
- `framer-motion` drives the open/close + flash animations.

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

All audio is in `public/assets/audio/` and mapped by role, not file path:

| Role | Source | Triggers |
|------|--------|----------|
| Ambient bed | `ambient/bg_loop.wav` | Fades in on game-start, ducks during win/lose stings |
| Move | `effects/move.ogg` | Any successful piece move (1-stack or full stack) |
| Chonk | `effects/chonk.ogg` | A move that lands on top of a stack of equal-or-greater height |
| Split | `effects/split.ogg` | Player commits a split (drag started after hold-ready) |
| Game-over sting | `effects/game_over_sting.ogg` | Plays before either voice line below |
| Win | `voices/you_win.ogg` | Local player has all top-of-stacks on opponent's home row |
| Lose | `voices/you_lose.ogg` | Opponent has all top-of-stacks on local player's home row |

Audio is wired through a single `AudioBus` (`src/audio/audioBus.ts`) so volume/mute is one source of truth. Volumes per role are committed defaults — no runtime mixing UI in v1.

---

## Motion

`framer-motion` owns all 2D UI motion. R3F + GSAP-style tweens (or `@react-three/drei`'s `useSpring`) own 3D piece motion. Two motion budgets:

- **UI motion** — radial overlay open (160ms ease-out), slice flash (240ms ease-in-out, 2 cycles), modal in/out (180ms).
- **Piece motion** — lift-arc-drop on move (420ms total: 120ms lift, 200ms arc, 100ms settle bounce). Split-extract is 300ms for the slice-pucks to detach + follow pointer.

Reduce-motion users (`prefers-reduced-motion`) get instant snaps for UI and a flat 200ms linear translate for pieces — no arcs, no bounces.

---

## Win condition

The game ends the moment **every top-of-stack** of a single colour sits on the opponent's home row. Sub-stacks below those tops do not need to belong to the winner. If the opponent has no remaining top-of-stack pieces of their own anywhere on the board, that's a forced win for the winner on the same turn.

The win check runs after every move resolves, before the turn flips.

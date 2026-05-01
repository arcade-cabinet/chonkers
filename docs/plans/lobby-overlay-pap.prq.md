---
title: PRD — branded overlay menus + Pass-and-Play
created: 2026-04-30
status: ACTIVE
owner: jbogaty
---

# PRD: branded overlay menus + Pass-and-Play

## Why

The current lobby is two `Play` / `Resume` SVG affordances stuck on the demo pucks at boot, sitting on a board that only conveys "tap a piece, do something." It's hostile to first-time players (no difficulty hint, no settings, no clue what Pass-and-Play even means because it doesn't exist), it can't really be tested by Playwright without testHook shortcuts (the affordances are SVG-in-foreignObject driven by raycaster math), and it gives axe almost nothing to assert on.

Two things change with this PRD:

1. **Lobby + match-config + settings + pause + end-game move to centered branded overlays.** Solid components rendered into a sibling `<div id="ui-root">` next to the `<canvas>`. Real `<dialog>`s, real focus traps, real ARIA, axe-passable, Playwright-clickable.
2. **Pass-and-Play (PaP) hotseat ships.** Both sides are human on the same device. The pivot-drag turn-end rotates the board + frame **180°** so the next player sees their orientation right-side-up. Couch co-op feature in its own right, gateway to future P2P serverless multiplayer.

The diegetic-UI rule revises but does not vanish: **menus are centered branded overlays; per-stack interaction stays diegetic SVG on the canvas**. The split radial still anchors to the stack it splits. The pivot-drag still ends the turn. Only the menu chrome moves out.

## Scope

In scope:

- New `app/` directory at repo root holding Solid `.tsx` overlays. Mounted into a `<div id="ui-root">` sibling to `<canvas>` in `index.html`.
- Lobby overlay: title art + 3 buttons — **New Game**, **Continue Game** (greyed when no saved match), **Settings**.
- New-game config overlay: 4 cards — **Easy** / **Medium** / **Hard** (vs AI) and **Pass and Play** (hotseat). Each card has a one-line descriptor.
- Settings overlay (also reachable via a hamburger affordance on the bezel during gameplay): audio mute, haptics toggle, reduced-motion toggle, default-difficulty selector. v1 English-only — no language picker.
- Pause overlay: Resume / Settings / Quit. Replaces the existing diegetic pause radial.
- End-game overlay: Play Again / Quit. Replaces the existing diegetic end-game radial.
- Broker `pass-and-play` mode: both sides driven by human input, no AI dispatch.
- Scene `tweenBoardRotate180` (extends `tweenBoardTip`): rotates board + bezel frame 180° during the PaP turn-end pivot drag, so the next player sees their orientation right-side-up.
- Biome lint rules: `solid-js` only importable from `app/**`; `three` / `gsap` / canvas APIs only importable from `src/scene/**`. The two universes don't cross-contaminate.
- E2E specs `lobby-flow.spec.ts` (boot → click overlay buttons → reach match) and `pass-and-play.spec.ts` (full hotseat match exercising every interaction without testHook shortcuts).
- Updated docs: `docs/UI_FLOWS.md` (mermaid state diagrams), `docs/DESIGN.md` "Diegetic UI" section, `docs/RULES.md` §8 Pass-and-Play, `CLAUDE.md` repo-rules + `.claude/gates.json` ban-pattern updates.

Out of scope (explicit):

- Online multiplayer / matchmaking. PaP is the local-only foundation; networked play is a future PRD.
- Settings persistence schema migration (current `kv` already handles a flat object — we just add new keys).
- Lobby art / brand overhaul. The PRD adds the overlay surface; visual branding lands in a follow-up R-stage tune.
- Re-skinning the existing diegetic SVG radials. The split radial still works exactly as it does today.

## Acceptance criteria

1. **Boot reaches lobby overlay.** Loading the app shows the centered branded overlay with three buttons. The lobby pucks no longer carry SVG affordances. (Demo pucks may still rotate idly — pure decoration.)
2. **Continue Game greys when no saved match.** `Continue` button is `disabled` + `aria-disabled="true"` when `loadActiveMatch()` returns `null`. Clicking it does nothing.
3. **New Game opens config overlay with 4 cards.** Easy / Medium / Hard / Pass and Play. Each card has a `<button>` with a labelled name + descriptor visible to screen readers.
4. **Difficulty selection starts an AI match.** Clicking Easy / Medium / Hard creates a match with the corresponding profile pair (`{disposition}-{difficulty}` × 2 — disposition is randomised for variety) and returns control to the play screen.
5. **Pass-and-Play starts a hotseat match.** Clicking PaP creates a match with both sides flagged `human`. The broker's auto-step is disabled for both colours; the scene's pivot-gate is required for every turn-end on both sides.
6. **PaP turn handoff rotates 180°.** When the on-turn player completes their pivot drag, the board + bezel + scene group rotate 180° (the rotation is part of the same gsap tween as the existing tip animation). The next player sees their pieces near the bottom of the screen, their goal row at the top.
7. **Settings overlay reachable from lobby AND from a bezel hamburger during gameplay.** Bezel affordance is a small `<button>` overlaid on the top-right corner of the bezel mesh's screen-space projection. Opens the same Solid component as the lobby's Settings entry.
8. **All overlays use real `<dialog>` elements with focus traps + escape-to-close.** First-tab lands on the primary action, ESC closes (lobby has no close — it IS the root).
9. **Axe spec passes.** Lobby + new-game-config + settings + pause + end-game all return 0 critical / serious WCAG 2.1 AA violations.
10. **`pass-and-play.spec.ts` passes.** Pure-DOM Playwright spec drives a complete hotseat match through: boot → New Game → Pass and Play → red commits a move → red pivots → board rotates 180° → white commits a move → white pivots → repeat for ≥ 6 turns covering: full-stack move, chonk-onto-equal, split-radial open, slice select, hold-to-arm (use `page.mouse.down` + 3000ms `waitForTimeout` + drag-commit), pivot turn-end, pause radial open + dismiss. Asserts engine state matches the expected sequence at each ply.
11. **Lint gate.** `solid-js` imports outside `app/**` fail biome check; `three` / `gsap` imports inside `app/**` fail biome check. CI fails before tests if violated.
12. **Engine + AI + sim tests pass unchanged.** Pure-TS layers are not touched by this PRD.

## Architecture

### Directory layout

```
app/                              # Solid TSX overlays. Mounted into <div id="ui-root">.
├── main.tsx                      # Solid render root. Subscribes to sim state.
├── overlays/
│   ├── Lobby.tsx                 # Title overlay: New / Continue / Settings.
│   ├── NewGameConfig.tsx         # 4-card difficulty + PaP picker.
│   ├── Settings.tsx              # Audio / haptics / reduced-motion / default-difficulty.
│   ├── Pause.tsx                 # Resume / Settings / Quit.
│   └── EndGame.tsx               # Play Again / Quit.
├── primitives/
│   ├── Modal.tsx                 # <dialog> wrapper with focus trap + ESC handling.
│   ├── Button.tsx                # Branded button primitive.
│   └── Card.tsx                  # Difficulty card primitive.
├── stores/
│   └── ui-store.ts               # Solid signals reflecting koota state (which overlay is open).
└── styles.css                    # Overlay-only CSS; canvas styles stay in src/scene/.

src/scene/                        # Unchanged shape. Diegetic SVG radial stays.
├── ...                           # All existing files.
└── overlay/                      # Diegetic SVG overlays.
    └── splitRadial.ts            # Stays. The only per-stack overlay we keep.
                                  # lobbyAffordances.ts / menuRadial.ts deleted; lobby
                                  # logic lives in app/overlays/Lobby.tsx, pause radial
                                  # in app/overlays/Pause.tsx, end-game in EndGame.tsx.

index.html                        # Adds <div id="ui-root">; loads both src/scene/index.ts
                                  # AND app/main.tsx as separate Vite entry points.
```

### Inter-layer contract

The Solid layer and the three.js layer share state via the existing `koota` world. Both subscribe to:

- `Screen` trait (which screen we're on: `title` | `play` | `paused` | `win` | `lose` | `spectator-result`).
- `Match` trait (game state for HUD).

The Solid layer **never** touches three.js objects. The three.js layer **never** touches DOM elements outside `<canvas>` and `src/scene/overlay/*` SVG. The bridge is the koota world + the broker `actions` namespace.

### Pass-and-Play mode

`MatchHandle.humanColor` becomes `"red" | "white" | "both" | null`:
- `"red"` — vs AI, human plays red.
- `"white"` — vs AI, human plays white.
- `"both"` — Pass and Play; both colours are human.
- `null` — sim mode (governor + alpha tests). Both colours are AI.

Broker behavior:
- `humanColor === "both"` → broker never auto-steps. Every action arrives via `commitHumanAction` from the scene layer.
- `humanColor === "red" | "white"` → broker auto-steps when `state.turn !== humanColor` (existing behavior).
- `humanColor === null` → broker auto-steps every turn (existing behavior).

Scene pivot-gate:
- `humanColor === "both"` → pivot-gate fires on every turn-end. After pivot, the broker is told "now red is on turn" (or white) but no AI is dispatched — control returns to the input layer awaiting the next human action.
- `humanColor === "red" | "white"` → pivot-gate fires only on the human side's turn-end (existing).
- `humanColor === null` → pivot-gate never fires (existing).

### 180° rotation in PaP

Existing `tweenBoardTip` rotates the board group around its X axis by `±UI_BOARD_TIP_RAD` to convey "side-on-turn." In PaP we replace this animation on turn-end with a rotation around the Y axis by `Math.PI` so the entire board + bezel flips end-over-end. The new function signature:

```ts
tweenBoardHandoff({
  boardGroup,
  mode: "tip" | "pap-handoff",
  direction: -1 | 1,        // tip mode only
});
```

The pap-handoff mode bakes in the existing tip animation as the first half (board tilts toward opponent) then continues the rotation through 180° during the second half. Total duration ~700ms (matches `tokens.motion.boardHandoffMs`, new token).

### Lint rules

`biome.json` adds:

```jsonc
{
  "linter": {
    "rules": {
      "nursery": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "solid-js": { "loc": "app/**" },
              "three": { "loc": "src/scene/**" },
              "gsap": { "loc": "src/scene/**" }
            }
          }
        }
      }
    }
  }
}
```

(Or equivalent — biome's noRestrictedImports doesn't support `loc` filtering directly; we may need a small custom check in `commit-gate.mjs` instead. PRQ-C3 picks the implementation.)

## Testing strategy

- **Engine + AI + sim**: unchanged. Their tests don't see the overlay layer.
- **Scene unit tests**: extend `tweenBoardHandoff` test to assert the 180° endpoint and that the function is idempotent across PaP turn flips.
- **Solid component tests**: vitest browser tier. Each overlay has a snapshot + a click-the-button-fires-the-action test.
- **E2E `lobby-flow.spec.ts`**: pure DOM clicks, no testHook shortcuts. Boot → click "New Game" → click "Easy" → wait for play screen.
- **E2E `pass-and-play.spec.ts`**: pure DOM, full hotseat match. Drives every interaction the spec requires (move, chonk, split, pivot, pause). Asserts engine state at each ply.
- **E2E `accessibility.spec.ts`** (existing): extended to also audit the new lobby + new-game-config overlays.

## Tasks

1. **C1 (this PRD)** — docs (UI_FLOWS.md, DESIGN.md revision, RULES.md §8, CLAUDE.md, gates.json).
2. **C2** — tests for the new overlays + PaP flow. RED-then-GREEN: tests written + expected-to-fail before the Solid code lands.
3. **C3** — Solid app/, broker `pass-and-play` mode, scene 180° rotation, lint rule.
4. **C4** — kill the old `lobbyAffordances.ts` + `menuRadial.ts` + scene's lobby/pause/end-game wiring. Delete-only PR.
5. **C5** — wire bezel hamburger affordance for Settings during gameplay.

---
title: Chonkers Documentation
updated: 2026-04-30
status: current
domain: index
---

# Chonkers Documentation

Source of truth for the Chonkers game project. Read these in order before touching code:

1. [DESIGN.md](./DESIGN.md) — vision, brand pillars, visual identity, diegetic-UI surfaces, design tokens, fonts, motion.
2. [RULES.md](./RULES.md) — authoritative gameplay rules. When code disagrees with this file, this file wins.
3. [ARCHITECTURE.md](./ARCHITECTURE.md) — module boundaries, data flow, three.js scene composition, state ownership.
4. [TESTING.md](./TESTING.md) — test pyramid (Vitest node + browser, Playwright E2E, Maestro native), coverage gates.
5. [STATE.md](./STATE.md) — current implementation status snapshot.
6. [LORE.md](./LORE.md) — flavour, naming, in-world voice for surface UI copy.

## References

- [`references/game.md`](./references/game.md) — original brainstorm and design conversation.
- [`references/poc.html`](./references/poc.html) — single-file Three.js prototype that the shipped render layer is a faithful port of.

The POC is the canonical pattern reference — vanilla three.js + DOM-sibling SVG overlay positioned via `camera.project()` of a piece's world position. The shipped game implements that same pattern in TypeScript, extended with PBR materials, HDRI lighting, gsap-driven motion, and the full set of diegetic UI surfaces described in `DESIGN.md`. Where the POC uses placeholder visuals (HSL home-row gradient, flat board colour, raw `tween.js`), the rebuild substitutes the canonical assets and libraries from `public/assets/` and the project's locked dependency stack.

## Stack

| Concern | Library |
|---|---|
| 3D rendering | `three` |
| Animation (3D + 2D SVG) | `gsap` |
| Diegetic UI overlays | vanilla SVG, positioned per-frame via `camera.project()` |
| State (in-memory) | `koota` (ECS) |
| Persistence | `drizzle-orm` + `@capacitor-community/sqlite` + `@capacitor/preferences` |
| Audio | `howler` |
| Native shell | `@capacitor/*` |
| Build | `vite` |
| Test | `playwright` (E2E + golden) + `vitest` (node + browser) |

There is no React, no JSX, no R3F, no Radix, no framer-motion in the application.

## Project layout

| Path | Purpose |
|------|---------|
| `index.html` | Single entry: `<canvas>` + `<div id="overlay">`, loads `src/scene/index.ts` |
| `src/scene/` | Three.js scene + gsap tweens + diegetic SVG overlays |
| `src/engine/` | Pure rules engine (no IO, no DOM, no PRNG) |
| `src/ai/` | Yuka graph + alpha-beta minimax (deterministic) |
| `src/sim/` | Koota state + actions broker |
| `src/store/` | Typed CRUD repos over drizzle |
| `src/persistence/` | Capacitor Preferences + capacitor-sqlite |
| `src/audio/` | Howler audio bus, role-keyed clips |
| `src/design/` | Design tokens (no Radix theme bridge) |
| `src/utils/` | Coords, type guards, asset manifest |
| `public/assets/` | Curated, non-procedural game assets — audio, fonts, HDRI, PBR textures |
| `docs/` | This documentation |
| `android/`, `ios/` | Capacitor native shells |
| `.github/workflows/` | CI, CD, release pipelines |

## No procedural generation

Every visible asset (board wood, piece wood, HDRI, fonts, audio) is curated and committed under `public/assets/`. The only procedurally generated surfaces are the diegetic SVG radials drawn on top of pieces — those are geometric UI, not content.

## Development commands

```bash
pnpm install       # install deps (requires pnpm 10+)
pnpm dev           # Vite dev server
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome check .
pnpm format        # biome format --write .
pnpm test          # node + browser unit tests
pnpm test:node     # node-only unit tests (fastest)
pnpm test:browser  # Vitest browser project (real Chromium GPU)
pnpm test:e2e      # Playwright end-to-end
pnpm build         # production web bundle → dist/
pnpm cap:sync      # build web + sync to android/ios native projects
```

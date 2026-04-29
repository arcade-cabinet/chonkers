---
title: Chonkers Documentation
updated: 2026-04-29
status: current
domain: index
---

# Chonkers Documentation

Source of truth for the Chonkers game project. Read these in order before touching code:

1. [DESIGN.md](./DESIGN.md) — vision, brand pillars, visual identity, design tokens, fonts.
2. [RULES.md](./RULES.md) — authoritative gameplay rules. When code disagrees with this file, this file wins.
3. [ARCHITECTURE.md](./ARCHITECTURE.md) — module boundaries, data flow, R3F scene tree, state ownership.
4. [TESTING.md](./TESTING.md) — test pyramid (Vitest node + browser, Playwright E2E), coverage gates.
5. [STATE.md](./STATE.md) — current implementation status snapshot.
6. [LORE.md](./LORE.md) — flavour, naming, in-world voice for surface UI copy.

## References

- [`references/game.md`](./references/game.md) — original brainstorm and design conversation.
- [`references/poc.html`](./references/poc.html) — single-file Three.js prototype (visual reference only — not the canonical implementation).

The POC is a **visual + interaction reference**. It is not load-bearing. The shipped game replaces every line of it with React + R3F + Radix + framer-motion in TypeScript.

## Project layout

| Path | Purpose |
|------|---------|
| `src/` | TypeScript app source (entry: `src/main.tsx`) |
| `public/assets/` | Curated, non-procedural game assets — audio, fonts, HDRI, PBR textures |
| `docs/` | This documentation |
| `android/`, `ios/` | Capacitor native shells |
| `.github/workflows/` | CI, CD, release pipelines |

## No procedural generation

Every visible asset (board wood, piece wood, HDRI, fonts, audio) is curated and committed under `public/assets/`. The only procedurally generated surface is the SVG radial **split overlay** rendered on top of a stack — it is geometric UI, not content.

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

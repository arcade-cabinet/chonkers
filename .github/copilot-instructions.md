# Chonkers Copilot Instructions

## Source Of Truth

- Vision and identity: `docs/DESIGN.md`
- Gameplay rules (authoritative): `docs/RULES.md`
- Technical architecture: `docs/ARCHITECTURE.md`
- Testing strategy: `docs/TESTING.md`
- Current implementation status: `docs/STATE.md`
- Voice / surface copy: `docs/LORE.md`

## Project Expectations

- Chonkers is a deterministic 3D tabletop strategy game. There is no RNG anywhere in `src/game/`. Any future randomness (AI move selection, etc.) must be seeded and isolated under `src/ai/`.
- Stacking is not capture. The rules engine **never removes a piece from play** — pieces only get re-stacked.
- Asset pipeline is curated, not procedural. Every visible texture, font, and audio file lives under `public/assets/` and is committed. The only procedurally generated visuals are the radial split overlay (SVG geometry) and the home-row colour gradient (fragment shader). Do not add procedural piece patterns, board patterns, or HDRI substitutes.
- Mobile is the primary target. The split overlay is designed for thumb interaction first.
- Web is the primary development surface. Capacitor wraps the same dist/.

## Tooling

- Package manager: `pnpm` (10+)
- Lint/format: `biome` (2.4+)
- Native shell: `capacitor` (8+)
- Browser automation: `playwright`
- Native smoke automation: `maestro` (release-candidate gate only)
- Language: TypeScript 6.0.2+, strict mode

## Required Verification

Before opening a PR for changes that touch the game logic or render layer:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test:node` (tier 1 — pure logic)
- `pnpm run test:browser` (tier 2 — R3F render)
- `pnpm run test:e2e:ci` (tier 3 — Playwright smoke) for input / interaction changes

## Module Boundaries

- `src/game/` is pure TS — must not import from `src/render/`, `src/ui/`, or `src/input/`.
- `src/render/` (R3F) imports from `src/game/` and `src/design/` only.
- `src/ui/` (Radix + framer-motion) imports from `src/game/` (state read), `src/design/`, and `src/audio/`.
- `src/audio/` is a leaf — never imports `src/game/`.

## Release Rule

Do not treat the game as release-ready until:

- `pnpm run test:node` is green
- `pnpm run test:browser` is green
- `pnpm run test:e2e:ci` is green
- A Maestro flow boots the Capacitor Android build to the title screen
- Visual snapshots align with the Three.js POC at `docs/references/poc.html`

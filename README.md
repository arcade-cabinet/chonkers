# Chonkers

> **Stack. Don't capture.**

A 3D tabletop strategy game — checkers reimagined around stacking. You don't remove your opponent's pieces. You **chonk** them. You climb on top, take dominant control of the tower, and carry it forward toward the opponent's home row.

Built with React + R3F + Radix Themes + framer-motion in TypeScript, shelled by Capacitor for iOS and Android.

---

## Quick start

```bash
pnpm install        # install deps (requires pnpm 10+)
pnpm dev            # Vite dev server → http://localhost:5173/chonkers/
pnpm typecheck      # tsc --noEmit
pnpm lint           # biome check
pnpm test:node      # tier-1 pure-logic unit tests
pnpm test:browser   # tier-2 R3F render tests (real Chromium GPU)
pnpm test:e2e:ci    # tier-3 Playwright smoke
pnpm build          # production web bundle → dist/
pnpm cap:sync       # build + sync to android/ios native projects
```

## Documentation

- [`docs/DESIGN.md`](docs/DESIGN.md) — vision, palette, fonts, tokens
- [`docs/RULES.md`](docs/RULES.md) — authoritative gameplay rules
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — module boundaries + data flow
- [`docs/TESTING.md`](docs/TESTING.md) — 4-tier test pyramid
- [`docs/STATE.md`](docs/STATE.md) — current implementation status

## Tech stack

| Layer | Tool |
|-------|------|
| Language | TypeScript 6.0+ (strict) |
| 3D render | React Three Fiber + drei + Three.js |
| 2D UI | Radix Themes + framer-motion |
| State | Zustand + immutable reducer |
| Native shell | Capacitor 8 (iOS + Android) |
| Storage | `@capacitor/preferences` (settings) + SQLite (`@capacitor-community/sqlite` / `jeep-sqlite`) (history) |
| Audio | curated WAV/OGG via a single `AudioBus` |
| Build | Vite |
| Lint/format | Biome |
| Testing | Vitest (node + browser) + Playwright (e2e) + Maestro (native smoke) |
| Releases | release-please (Conventional Commits) |

## Project layout

| Path | Purpose |
|------|---------|
| `src/` | TypeScript app source |
| `public/assets/` | Curated assets — audio, fonts, HDRI, PBR textures |
| `docs/` | Authoritative documentation |
| `android/`, `ios/` | Capacitor native shells |
| `.github/workflows/` | CI, CD, release pipelines |

## License

MIT.

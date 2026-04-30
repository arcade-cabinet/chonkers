# Chonkers

> **Stack. Don't capture.**

A 3D tabletop strategy game — checkers reimagined around stacking. You don't remove your opponent's pieces. You **chonk** them. You climb on top, take dominant control of the tower, and carry it forward toward the opponent's home row.

Built with React + R3F + Radix Themes + framer-motion in TypeScript, shelled by Capacitor for iOS and Android.

---

## Quick start

```bash
pnpm install        # install deps (requires pnpm 10+)
pnpm dev            # Vite dev server → http://localhost:5173/chonkers/
pnpm cap:sync       # build + sync to android/ios native projects
```

See [Test surfaces](#test-surfaces) below for the full test/lint/build matrix.

## Test surfaces

The project ships five distinct test surfaces, in roughly increasing order of cost. The full pyramid is documented in [`docs/TESTING.md`](docs/TESTING.md); this table is the executable summary.

| Command | Tier | Runtime | What it covers | When it runs |
|---|---|---|---|---|
| `pnpm test:node` | 1 | ~2s | Pure-logic unit tests (engine, AI, sim broker, store) — no UI, no GPU, no browser | Every commit + every PR (`core` job) |
| `pnpm test:browser` | 2 | ~30s | R3F render assertions on real Chromium GPU via Vitest browser | Every PR (`browser` job) |
| `pnpm test:alpha` | 1 (governor) | ~100s | 100-run broker spec — alpha-stage end-to-end signal in `replay` mode (host-independent) | Every PR (`governor-alpha` job) once wired |
| `pnpm test:governor` | 1 (governor) | ~30–60min | 1000-run broker spec — beta-stage balance assertions across all 9 profile pairings | Nightly during beta stage |
| `pnpm test:e2e:ci` | 3 | ~10s | Playwright smoke — boot, lobby renders, AI-vs-AI demo progresses | Every PR (`e2e-smoke` job) |
| `pnpm test:e2e:nightly` | 3 | (planned) | Full Playwright governor + visual snapshots | Nightly during beta+ stages |

Lint, typecheck, build:

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check
pnpm build       # production web bundle → dist/
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
| State | koota (ECS) — match state as traits on a singleton match entity |
| Native shell | Capacitor 8 (iOS + Android) |
| Storage | `@capacitor/preferences` for settings; drizzle ORM + `@capacitor-community/sqlite` for match history (build-time `public/game.db` + runtime version-replay; see `docs/DB.md`) |
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

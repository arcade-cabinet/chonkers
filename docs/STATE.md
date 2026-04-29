---
title: State
updated: 2026-04-29
status: current
domain: context
---

# State — as of 2026-04-29

## Where we are

Initial commit. The repository is being seeded with:

- Curated assets (audio, fonts, HDRI, PBR for board + both pieces).
- Capacitor 8 shell (iOS + Android).
- Vite + TypeScript 6 dev environment.
- Biome lint/format, release-please, dependabot, CI/CD workflows.
- Authoritative documentation (this directory).
- Initial R3F + Radix + framer-motion skeleton with a tilted board view, both home rows colour-graded, and the 5-4-3 starting layout rendered with PBR-textured pucks.

## What is done

- Asset library curated under `public/assets/`: audio (ambient + 4 effects + 2 voices), fonts (Lato body, Abril Fatface header), HDRI background, PBR sets for the board and both piece colours.
- `package.json` updated to TypeScript 6, React 19, R3F 9, drei, Radix Themes, framer-motion. pnpm 10 lockfile committed.
- `tsconfig.json` strict mode (noUncheckedIndexedAccess, exactOptionalPropertyTypes).
- `biome.json` aligned with sibling projects (tab indent, double-quote JS).
- CI/CD workflows (`.github/workflows/{ci,cd,release,automerge}.yml`) wired for chonkers (build, typecheck, lint, test:node, test:browser, e2e:smoke, Pages deploy, Android debug APK on push, AAB on release).
- Capacitor config branded `com.arcadecabinet.chonkers` / "chonkers".
- `release-please-config.json` package-name set to `chonkers`.
- Design tokens committed (`src/design/tokens.ts`) with palette derived from PBR mid-tones + Lato/Abril Fatface declared as `@font-face` in `src/css/fonts.css`.
- Initial R3F scene renders the board (PBR + engraved gridlines), both home-row gradients, and the 5-4-3 starting position.
- Radix theme provider wired with `accentColor` matching `accent.select`; framer-motion fade-in for the title screen.
- Empty-shell `capacitor-welcome` removed; replaced by `<App />` mounting at `#root`.

## What is NOT yet done

Everything below is queued for follow-up commits (one feature per PR per the autonomy policy in `~/.claude/CLAUDE.md`):

- Move generation + reducer for tier-1 game logic (`src/game/moves.ts`, `gameState.ts`).
- Pointer / touch input pipeline (`src/input/`).
- Split overlay (SVG + framer-motion + state machine).
- Audio bus and role wiring.
- SQLite match-history schema.
- Win/lose screens with voice playback.
- Pause + settings.
- Tutorial overlay.
- Visual snapshot baselines (tier-2 browser tests).
- Playwright e2e specs.
- Maestro flows.
- iOS app icon, Android adaptive icon.

## Open questions

- AI opponent for v1.0? Currently red moves first; both seats are human (hot-seat). An AI opponent is a v1.1 question, not a v1.0 blocker.
- Online matchmaking? Out of scope for v1.0. The SQLite schema leaves room for a `remote_match_id` column without committing to a backend.
- Tutorial: scripted or organic-discovery? Open question; resolve before v1.0.

## Reference snapshots

The Three.js POC at `docs/references/poc.html` is the visual + interaction reference for everything ahead. It is **not** the implementation — every subsystem will be re-built in TS + R3F + Radix + framer-motion, but the POC remains the source of truth for "does the split feel right."

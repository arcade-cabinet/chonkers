---
title: State
updated: 2026-05-01
status: current
domain: context
---

<!-- Last update: 2026-05-01 (PRQ-C1..C5 + pieces.dispose fix shipped on prd/threejs-shell; PRQ-B6 governor moved to dedicated CI workflow via PR #12). -->


# State

This document describes **what is currently committed in the repo** and **what stage of the validation cadence the project is in**. It is the snapshot a returning contributor reads to orient. It is updated on every PRQ merge.

## Stage

Stages reflect *kind of validation completed*, not *version number*. release-please owns version numbers as conventional commits accumulate.

| Stage | Threshold | Bias | Locks in |
|---|---|---|---|
| **pre-alpha** | PRQs in flight | unit-exercising contracts during construction | individual subsystem APIs + the broker that orchestrates them |
| **alpha** | 100 AI-vs-AI broker runs pass | unit-exercising end-to-end | every PRQ has landed; broker drives engine + ai + store + analytics + persistence as a closed loop; first AI-weight tune from the resulting balance data |
| **beta** | 1,000 in-browser AI-vs-AI governor runs pass | playtesting the real visual stack | three.js scene + gsap motion + audio + diegetic SVG overlays + input pipeline all integrate cleanly under sustained automated play; second AI-weight tune at higher statistical power |
| **rc** | 10,000 governor runs + balance + profiling clean | outlier hunting + perf | no remaining visual glitches; AI-weight tuning finalised; profile pairs surveyed for unresolved-match outliers (AI evaluation gaps, not draws — the rule set has no draw condition); perf within budget |

**Current stage: alpha (reached 2026-04-30 via the threejs-shell rebuild).** The previous alpha gate had been reached against an R3F + Radix + framer-motion render shell, then regressed when that shell was scrapped on 2026-04-30 (it diverged from the diegetic-UI vision in `DESIGN.md`, hit R3F-reconciler crashes when SVG overlays were nested inside `<Canvas>`, and produced ugly menu chrome instead of affordances on pieces). The application was rebuilt later that day as **vanilla three.js + gsap** with diegetic SVG overlays — no React, no JSX, no R3F, no Radix, no framer-motion. PRQ-T0..T9 landed in 9 commits on `prd/threejs-shell` and reached the alpha gate that same day. The pure-TS layers (`src/{engine,ai,sim,persistence,audio,design,utils}/`) are unchanged from the prior alpha; only the render layer moved from `app/` to `src/scene/`. Persistence collapsed to KV-only via PRQ-T-persist (SQLite + drizzle + analytics ripped — see `docs/PERSISTENCE.md`). PR #10 (the old `prd/polish` shell) is closed; the new shell ships from `prd/threejs-shell`.

## What is committed

- Curated assets under `public/assets/`: audio (ambient + 4 effects + 2 voices), fonts (Lato body, Abril Fatface display), HDRI background, PBR sets for board and both piece colours.
- Capacitor 8 shell (iOS + Android) — `com.arcadecabinet.chonkers`.
- Vite + TypeScript 6.0+ dev environment with strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
- Biome lint/format aligned with sibling arcade-cabinet projects.
- release-please + dependabot + CI/CD workflows wired (`.github/workflows/{ci,cd,release,automerge}.yml`).
- Authoritative documentation under `docs/`: this file, `RULES.md`, `DESIGN.md`, `LORE.md`, `ARCHITECTURE.md`, `PERSISTENCE.md`, `AI.md`, `TESTING.md`.
- PRD pipeline under `docs/plans/`: active PRDs are `logic-surfaces-and-broker`, `audio-and-design-tokens`, `e2e-governor`, `native-shell`. The `visual-shell` PRD is superseded by the threejs-shell rebuild (see directive). The `persistence-and-db` PRD has been retired — persistence is now KV-only and the design fits in `docs/PERSISTENCE.md`.
- Coordination state under `.agent-state/`: directive (the queue), digest, cursor.
- Design tokens (`src/design/tokens.ts`) derived from PBR mid-tones. Lato + Abril Fatface install at runtime via a small `installFonts()` helper that writes `@font-face` rules from the ASSETS manifest into a single `<style>` element on boot.
- Capacitor Preferences `kv` typed wrapper at `src/persistence/preferences/kv.ts` with browser-tier vitest coverage.

## What is in flight

- **`prd/threejs-shell` (PR #11)** — render-layer rebuild + PRQ-C* arc + reviewer fixes. Vanilla three.js + gsap + diegetic SVG splitting radial; Solid TSX branded overlays at `app/` for Lobby / NewGame / Settings / Pause / EndGame; bezel hamburger anchored per-frame to projected bezel corner; Pass-and-Play hotseat with 180° handoff; Continue Game (KV-only persistence). PRQ-T0..T9 + B4 + B5 + C1..C5 landed; ~50 coderabbit reviewer findings absorbed across 5 forward-fix commits. Awaiting beta gate (PRQ-B6) before merge.
- **`ci/governor-workflow` (PR #12)** — 1-file PR adding `.github/workflows/governor.yml` to main so PRQ-B6 (1000-run AI-vs-AI in-browser governor) can be dispatched against `prd/threejs-shell`. Local-shell runs proved fragile; CI is the right primitive. Schedule: weekly Sun 08:00 UTC + manual `workflow_dispatch` with overridable run count.

## What has not started

- **beta gate (1000-run governor cycle)**: PRQ-B4 (engine + AI tune) + PRQ-B5 (e2e governor + a11y) shipped on `prd/threejs-shell`. The 100-run alpha governor and 3-run interactive governor both pass green; the 1000-run cycle dispatches via the new `.github/workflows/governor.yml` (PR #12) — `gh workflow run governor.yml --ref prd/threejs-shell -f runs=1000` once PR #12 merges, then beta gate flips and PR #11 can squash-merge.
- **rc gate (PRQ-R1)**: raise GOVERNOR_RUNS to 10000 in the e2e governor + Maestro Android smoke on real APK. The mobile/iPad Playwright projects are already wired (chromium + android-pixel + ios-iphone + ipad-landscape) — R1 only needs the higher run count. Lands as a post-beta PR.
- **store-listing prep (PRQ-R2)**: real iOS + Android screenshots via Maestro, privacy policy + ToS, app icon + splash + adaptive icon, store-listing copy under `docs/store/`. Tag rc-1.0.0. Final pre-release PR.

## Reference snapshots

The Three.js POC at `docs/references/poc.html` is the canonical reference. The rebuild is a faithful port of the POC's pattern, extended with PBR materials, HDRI lighting, gsap-driven motion, koota-backed state, and the full set of diegetic UI surfaces described in `DESIGN.md`. Where the POC uses placeholder visuals (HSL home-row gradient, flat board colour, raw `tween.js`), the rebuild substitutes the canonical assets and libraries — POC behaviour is the spec, POC visuals are not.

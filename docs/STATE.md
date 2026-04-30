---
title: State
updated: 2026-04-30
status: current
domain: context
---

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

**Current stage: pre-alpha (regressed 2026-04-30).** The previous alpha gate was reached against an R3F + Radix + framer-motion render shell. That shell was scrapped on 2026-04-30: it diverged from the diegetic-UI vision in `DESIGN.md`, repeatedly hit R3F-reconciler crashes when SVG overlays were nested inside `<Canvas>`, and produced ugly menu chrome instead of affordances on pieces. The application is being rebuilt as **vanilla three.js + gsap** with diegetic SVG overlays, no React, no Radix, no JSX. The pure-TS layers — `src/{engine,ai,sim,store,persistence,analytics,audio,design,utils}/` — are unaffected and remain the canonical implementation. The render layer moves into `src/scene/`. PR #10 will be closed; the new shell lands on a fresh PR.

## What is committed

- Curated assets under `public/assets/`: audio (ambient + 4 effects + 2 voices), fonts (Lato body, Abril Fatface display), HDRI background, PBR sets for board and both piece colours.
- Capacitor 8 shell (iOS + Android) — `com.arcadecabinet.chonkers`.
- Vite + TypeScript 6.0+ dev environment with strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
- Biome lint/format aligned with sibling arcade-cabinet projects.
- release-please + dependabot + CI/CD workflows wired (`.github/workflows/{ci,cd,release,automerge}.yml`).
- Authoritative documentation under `docs/`: this file, `RULES.md`, `DESIGN.md`, `LORE.md`, `ARCHITECTURE.md`, `PERSISTENCE.md`, `DB.md`, `AI.md`, `TESTING.md`.
- PRD pipeline under `docs/plans/`: seven PRDs (persistence-and-db, logic-surfaces-and-broker, audio-and-design-tokens, visual-shell, e2e-governor, native-shell, plus one merged-and-deleted: schema folded into persistence-and-db).
- Coordination state under `.agent-state/`: directive (the queue), digest, cursor.
- Design tokens (`src/design/tokens.ts`) derived from PBR mid-tones. Lato + Abril Fatface install at runtime via a small `installFonts()` helper that writes `@font-face` rules from the ASSETS manifest into a single `<style>` element on boot.
- Capacitor Preferences `kv` typed wrapper at `src/persistence/preferences/kv.ts` with browser-tier vitest coverage.

## What is in flight

- **`prd/threejs-shell` (new branch)** — rebuild of the render layer as `src/scene/`. Removes all React/R3F/Radix/framer-motion deps; adds gsap. Ports the POC's pattern verbatim (vanilla three.js scene + DOM-sibling SVG overlay positioned via `camera.project()`) and extends it to every diegetic surface (lobby Play/Resume on demo pucks, pause radial on centre cell, end-game radial on winning stack, settings as a radial). Sim/engine/AI/store/persistence/audio remain unchanged.

## What has not started

- **alpha gate (re-entry)**: 100-run broker pass against the new scene; 100-run governor pass through the rebuilt UI; first AI-weight tune.
- **rc gate (PRQ-R1)**: raise BETA_RUNS to 10000 in the e2e governor + add mobile/iPad Playwright projects + Maestro Android smoke on real APK. Lands as a post-beta PR.
- **store-listing prep (PRQ-R2)**: real iOS + Android screenshots via Maestro, privacy policy + ToS, app icon + splash + adaptive icon, store-listing copy under `docs/store/`. Tag rc-1.0.0. Final pre-release PR.

## Reference snapshots

The Three.js POC at `docs/references/poc.html` is the canonical reference. The rebuild is a faithful port of the POC's pattern, extended with PBR materials, HDRI lighting, gsap-driven motion, koota-backed state, and the full set of diegetic UI surfaces described in `DESIGN.md`. Where the POC uses placeholder visuals (HSL home-row gradient, flat board colour, raw `tween.js`), the rebuild substitutes the canonical assets and libraries — POC behaviour is the spec, POC visuals are not.

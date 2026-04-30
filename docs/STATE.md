---
title: State
updated: 2026-04-29
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
| **beta** | 1,000 in-browser AI-vs-AI governor runs pass | playtesting the real visual stack | R3F render + framer-motion + audio + Radix UI + input pipeline all integrate cleanly under sustained automated play; second AI-weight tune at higher statistical power |
| **rc** | 10,000 governor runs + balance + profiling clean | outlier hunting + perf | no remaining visual glitches; AI-weight tuning finalised; profile pairs surveyed for unresolved-match outliers (AI evaluation gaps, not draws — the rule set has no draw condition); perf within budget |

**Current stage: alpha** (reached 2026-04-30). All six framework PRDs (persistence-and-db, logic-surfaces-and-broker, audio-and-design-tokens, visual-shell, e2e-governor, native-shell) have merged via PRs #5/#7/#8/#9. Polish work continues on `prd/polish` (PR #10) — alpha-blockers cleared (split-radial UI, top-color cap, resume hydration, bezel-framed scene, koota subscription fix); beta-tier polish in flight (animated piece motion + audio integration + difficulty/color picker + magic-numbers-to-tokens all shipped; 1000-run governor + e2e-governor RUN are the only outstanding gates before beta flips).

## What is committed

- Curated assets under `public/assets/`: audio (ambient + 4 effects + 2 voices), fonts (Lato body, Abril Fatface display), HDRI background, PBR sets for board and both piece colours.
- Capacitor 8 shell (iOS + Android) — `com.arcadecabinet.chonkers`.
- Vite + TypeScript 6.0+ dev environment with strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
- Biome lint/format aligned with sibling arcade-cabinet projects.
- release-please + dependabot + CI/CD workflows wired (`.github/workflows/{ci,cd,release,automerge}.yml`).
- Authoritative documentation under `docs/`: this file, `RULES.md`, `DESIGN.md`, `LORE.md`, `ARCHITECTURE.md`, `PERSISTENCE.md`, `DB.md`, `AI.md`, `TESTING.md`.
- PRD pipeline under `docs/plans/`: seven PRDs (persistence-and-db, logic-surfaces-and-broker, audio-and-design-tokens, visual-shell, e2e-governor, native-shell, plus one merged-and-deleted: schema folded into persistence-and-db).
- Coordination state under `.agent-state/`: directive (the queue), digest, cursor.
- Initial R3F + Radix + framer-motion skeleton: tilted board view, both home rows colour-graded with distinct PBR woods, 5-4-3 starting position rendered with PBR-textured pucks.
- Design tokens (`src/design/tokens.ts`) derived from PBR mid-tones + Lato/Abril Fatface installed as `@font-face` rules at runtime by `app/css/fonts.ts` (BASE_URL-aware via the ASSETS manifest).
- Capacitor Preferences `kv` typed wrapper at `src/persistence/preferences/kv.ts` with browser-tier vitest coverage.

## What is in flight

- **PR #10 (`prd/polish`)** — polish-phase PR stacking PRQ-7..13 (deploy hotfix → visual fix → HUD polish → selection overlay → R3F pointer events → bezel composition → tipping board → bezel knock gesture → lobby + ceremony → 1000-run balance governor → e2e governor) plus PRQ-A0..A6 (koota subscription fix → split-arm UI → top-color cap → piece motion → resume hydration → audio integration → doc realignment) plus PRQ-B1/B3 (difficulty/color picker, magic-numbers-to-tokens). Currently waiting on the in-flight 1000-run governor RUN + e2e governor RUN to land green before beta flips.

## What has not started

- **rc gate (PRQ-R1)**: raise BETA_RUNS to 10000 in the e2e governor + add mobile/iPad Playwright projects + Maestro Android smoke on real APK. Lands as a post-beta PR.
- **store-listing prep (PRQ-R2)**: real iOS + Android screenshots via Maestro, privacy policy + ToS, app icon + splash + adaptive icon, store-listing copy under `docs/store/`. Tag rc-1.0.0. Final pre-release PR.

## Reference snapshots

The Three.js POC at `docs/references/poc.html` is the visual + interaction reference for everything ahead. It is **not** the implementation — every subsystem is rebuilt in TypeScript + R3F + Radix + framer-motion — but the POC remains the source of truth for "does the split feel right."

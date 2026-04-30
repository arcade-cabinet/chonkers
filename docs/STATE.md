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

**Current stage: pre-alpha.** PRQ-1 (persistence + db) in flight on branch `prd/persistence` (PR #5).

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

- **PRQ-1 (persistence + db)** — `prd/persistence` branch, PR #5. Combines the typed `kv` surface (committed) with the drizzle ORM + capacitor-sqlite runtime + version-replay bootstrap (in progress per `docs/DB.md`). Schema PRD has been merged into this PRQ; there is no separate schema PR.

## What has not started

PRDs queued, in dependency order:

- PRQ-2: logic surfaces + broker (`src/engine/`, `src/ai/`, `src/store/`, `src/analytics/`, `src/sim/`). Acceptance gate: 100-run broker pass → **alpha**.
- PRQ-3: audio + design tokens reconciliation (`src/audio/`, `src/design/`).
- PRQ-4: visual shell (`app/`).
- PRQ-5: e2e governor + accessibility (`e2e/`). Acceptance gate: 1,000-run governor pass → **beta**.
- PRQ-6: native shell (Capacitor iOS + Android). Acceptance gate: 10,000-run governor + balance + profiling clean → **rc**.

## Reference snapshots

The Three.js POC at `docs/references/poc.html` is the visual + interaction reference for everything ahead. It is **not** the implementation — every subsystem is rebuilt in TypeScript + R3F + Radix + framer-motion — but the POC remains the source of truth for "does the split feel right."

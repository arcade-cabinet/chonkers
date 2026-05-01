---
title: PRD — visual shell (SUPERSEDED)
updated: 2026-04-30
status: superseded
domain: technical
---

# PRD: visual shell — SUPERSEDED on 2026-04-30

This PRD originally specified a React + R3F + Radix + framer-motion application shell under `app/`. That approach was scrapped on 2026-04-30 for two reasons:

1. **Diegetic-UI vision drift.** The Radix screens (`TitleView`, `PlayView`, `PauseView`, etc.) and floating bezel buttons violate `DESIGN.md` — every interactive surface must be a diegetic SVG overlay positioned above a piece on the board. Conventional menu chrome is wrong for this game.
2. **R3F reconciler trap.** Mounting SVG inside the `<Canvas>` JSX tree (which the splitting radial requires) crashes because R3F's reconciler walks the entire subtree as THREE primitives. `<circle>` → `THREE.Circle` (undefined) → canvas crash. Repeated whack-a-mole patches (commit 4c31238 removed `<title>`; the next attempt found `<g>`) confirmed the architecture is wrong, not the symptom.

## What replaces it

`prd/threejs-shell` — a vanilla three.js + gsap render layer under `src/scene/`, ports the POC's pattern verbatim and extends it to the full diegetic UI surface set in `DESIGN.md`. See:

- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §"Everything is `src/`" + §"Scene composition"
- [`docs/DESIGN.md`](../DESIGN.md) §"Diegetic UI — every affordance lives on a piece" + §"Motion"
- [`docs/STATE.md`](../STATE.md) — current stage and what's in flight
- [`docs/plans/threejs-shell.prq.md`](./threejs-shell.prq.md) — the replacement PRD with the implementation queue

The pure-TS layers — `src/{engine,ai,sim,store,persistence,analytics,audio,design,utils}/` — are unaffected by the shell rewrite and remain the canonical implementation.

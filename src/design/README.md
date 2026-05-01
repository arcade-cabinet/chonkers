---
title: src/design
updated: 2026-04-30
status: current
domain: design
---

# src/design

Design tokens. Pure constants and types — no runtime IO, no DOM, no React.

## Layout

```text
src/design/
├── index.ts   # barrel: re-exports `tokens` and `Tokens`
└── tokens.ts  # one `tokens as const` export — wood, ink, accent,
               # surface, font, motion, board, scene, bezel,
               # splitRadial, turnBadge
```

## Quick start

```ts
import { tokens } from "@/design";
import * as THREE from "three";

// Reference token values when constructing materials:
const boardMat = new THREE.MeshStandardMaterial({
	color: tokens.wood.boardMain,
});

// Read motion durations into gsap factories:
import gsap from "gsap";
gsap.to(svgEl, { opacity: 1, duration: tokens.motion.uiOpenMs / 1000 });
```

## Tokens overview

See `docs/DESIGN.md` "Palette" + "Motion" for the full table. Sub-trees:

| Sub-tree | Purpose |
|----------|---------|
| `tokens.wood.*` | Wood diffuse mid-tones for board + pieces |
| `tokens.ink.*` | Body text colours on light vs dark surfaces |
| `tokens.accent.*` | Selection ring, danger flash, split-segment flash |
| `tokens.surface.*` | Modal scrim + pause overlay |
| `tokens.font.*` | Display + body font stacks |
| `tokens.motion.*` | UI + 3D-piece motion duration budgets (in ms) |
| `tokens.board.*` | Board dimensions (cols, rows, cellSize, puck dims) |
| `tokens.scene.*` | Camera position, fov, tilt magnitudes |
| `tokens.bezel.*` | Cabinet frame thickness, depth, lift |
| `tokens.splitRadial.*` | Slice-state colours for the splitting radial |
| `tokens.turnBadge.*` | Red/white colour banding for the diegetic turn indicator |

## Motion

`src/design` owns motion DURATIONS only. Animation lives in `src/scene/animations.ts` as `gsap` tween factories that read durations from `tokens.motion.*`. There is no Radix theme bridge and no framer-motion variant library — both have been removed.

## Import boundary

Per `CLAUDE.md`, this package has no external dependencies. It is a leaf — every consumer is downstream. `src/scene/` is the primary consumer.

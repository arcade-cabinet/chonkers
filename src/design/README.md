---
title: src/design
updated: 2026-04-30
status: current
domain: design
---

# src/design

Design tokens + Radix Themes config + framer-motion variant library. Pure constants and types — no runtime IO, no React, no DOM.

## Layout

```text
src/design/
├── index.ts        # barrel: tokens, radixTheme, all motion variants
├── tokens.ts       # one `tokens as const` export — wood, ink, accent,
│                   # surface, font, motion, board, splitRadial, turnBadge
├── theme.ts        # `radixTheme: ThemeProps` — Radix Themes config
└── motion.ts       # framer-motion Variants — radialOpen, radialClose,
                    # sliceSelect, holdFlash, modalIn, modalOut,
                    # screenFade, reducedMotionFallback
```

## Quick start

```tsx
import { tokens, radixTheme, modalIn } from "@/design";
import { Theme } from "@radix-ui/themes";
import { motion } from "framer-motion";

// Wrap the app in the Radix theme:
<Theme {...radixTheme}>{children}</Theme>

// Reference token values directly:
<div style={{ background: tokens.wood.boardMain }} />

// Use a motion variant:
<motion.div variants={modalIn} initial="hidden" animate="visible" />
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
| `tokens.splitRadial.*` | Slice-state colours consumed today by `app/canvas/SplitArmHeightBar.tsx`; reserved colour grammar for a future radial overlay |
| `tokens.turnBadge.*` | Red/white colour banding consumed by the `TurnIndicator` pill in `app/screens/PlayView.tsx` |
| `tokens.scene.*` | 3D camera framing (cameraX/Y/Z/Fov/Near/Far) + tilt geometry (baseTiltMagnitude, turnTiltDelta) |
| `tokens.bezel.*` | Bezel frame geometry (frameThickness, frameDepth, frameLift) |

## Motion variants

See `docs/DESIGN.md` "Motion" for the consumer table. All variants source their durations from `tokens.motion.*`. `reducedMotionFallback` is a near-instant drop-in for any variant when `usePrefersReducedMotion` (PRQ-4) returns true.

## Import boundary

Per `CLAUDE.md`, this package imports only `framer-motion` and `@radix-ui/themes` types. It does NOT import from `@/engine`, `@/ai`, `@/sim`, `@/store`, `@/persistence`, `@/audio`, or anywhere in `app/`. It is a leaf package — every consumer is downstream.

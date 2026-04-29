# Batch: chonkers-visual-shell

**Created:** 2026-04-29
**PRD:** [visual-shell.prq.md](./visual-shell.prq.md)
**Prerequisites:** persistence + schema + logic + audio-and-design all merged

## Tasks

1. [P1] **Author app/README.md** — Architecture diagram, strict-rules section.
2. [P1] **Update docs/ARCHITECTURE.md** — Reflect app/ shape; document one-way dep app→sim.
3. [P2] **Write app/input/__tests__/useHoldTimer.browser.test.tsx** — 3000ms arm fires; cancellation prevents; multiple holds reset; haptic.impact fires.
4. [P2] **Write app/input/__tests__/useDragTracker.browser.test.tsx** — <8px no-commit; ≥8px commits once; pointercancel resets.
5. [P2] **Write app/input/__tests__/useIntentDispatcher.browser.test.tsx** — State machine routes events to correct sim actions; uses real sim.
6. [P2] **Write app/canvas/__tests__/Board.browser.test.tsx** — Visual baseline for Scene + Board with starting state.
7. [P2] **Write app/components/__tests__/SplitRadial.browser.test.tsx** — Heights 2/6/8 × selection sets; correct slice count + run colors.
8. [P3] **Author app/index.html** — Vite entry; mounts #root; loads main.tsx.
9. [P3] **Author app/css/fonts.css + style.css** — Lato + Abril Fatface @font-face; CSS variables; reduced-motion override.
10. [P3] **Implement app/boot/boot.tsx + ErrorBoundary.tsx** — Schema bootstrap, audio init, sim world creation, Capacitor lifecycle.
11. [P3] **Implement app/main.tsx + App.tsx** — Entry, Theme + WorldProvider + ErrorBoundary; Screen-trait-driven router.
12. [P3] **Implement app/canvas/Scene.tsx + supporting** — Canvas, camera, environment, lighting, Board, Pieces, SelectionRing, ValidMoveMarkers, DraggingSubStack, SplitOverlayAnchor, DecisionTopography (dev-only).
13. [P3] **Implement app/input/usePointer + supporting** — usePointer, useHoldTimer, useDragTracker, useRaycastCell, useIntentDispatcher, intent.ts.
14. [P3] **Implement app/hooks/** — usePrefs, useFrameloop, usePrefersReducedMotion.
15. [P3] **Implement app/components/** — PrimaryButton, ToggleRow, ScrimDialog, TurnBadge, three RadioGroup atoms, SplitRadial.
16. [P3] **Implement app/screens/** — TitleView, PlayView, WinView, LoseView, PauseView, SettingsView.
17. [P4] **Manual playthrough** — pnpm dev; full match against AI; audio + animations; no console errors.
18. [P4] **Browser test suite** — pnpm test:browser app green, ≤2min, 5 consecutive runs.
19. [P4] **Build verification** — pnpm build clean; bundle size reasonable; no react in src/; no @/engine in components.

## Configuration

```yaml
batch_name: chonkers-visual-shell
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1
```

# Batch: chonkers-native-shell

**Created:** 2026-04-29
**PRD:** [native-shell.prq.md](./native-shell.prq.md)
**Prerequisite:** visual-shell.prq.md merged

## Tasks

1. [P1] **Update docs/DEPLOYMENT.md** — Capacitor sync, icon regen, per-platform builds, Maestro inventory.
2. [P1] **Update docs/STATE.md** — Native shell milestone.
3. [P1] **Author maestro/README.md** — Per-flow description, run instructions.
4. [P2] **Update capacitor.config.json** — All five plugin configs; appName "Chonkers"; bg colors.
5. [P2] **Install Capacitor plugins** — @capacitor/app, /haptics, /screen-orientation, /status-bar.
6. [P3] **Author assets/icon-source.svg** — 1024x1024 brand-palette mark, legible at 48px.
7. [P3] **Author scripts/generate-icons.ts + pnpm icons script** — Sharp-based regen for all sizes.
8. [P3] **Author assets/splash-source.svg + splash assets** — Wood-board subdued visual.
9. [P4] **Add app-state hooks to src/scene/index.ts** — Capacitor App + Page Visibility fallback wired to sim pause/resume.
10. [P4] **Add haptics to src/scene/overlay/splitRadial.ts** — Medium impact at 3s arm.
11. [P4] **Add haptics to src/scene/pieces.ts + animations.ts (chonk onComplete)** — Selection start; chonk impact heavy.
12. [P4] **Add pause/resume actions to src/sim/actions.ts** — Halt/resume frame loop + tweens; engine state unaffected.
13. [P5] **Author maestro/smoke.yml** — Full smoke flow per architecture.
14. [P5] **Add pnpm maestro:smoke script** — Local maestro runner.
15. [P5] **Author .github/workflows/native-smoke.yml** — Android emulator Maestro on push.
16. [P6] **Verify Android debug APK boots + plays** — pnpm native:android:debug; full match works.
17. [P6] **Verify iOS Simulator boots + plays** — pnpm native:ios:build; full match works.
18. [P6] **Verify app-state lifecycle on both platforms** — Background/foreground preserves state, no crash on rapid cycling.

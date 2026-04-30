# Batch: chonkers-e2e-governor

**Created:** 2026-04-29
**PRD:** [e2e-governor.prq.md](./e2e-governor.prq.md)
**Prerequisite:** visual-shell.prq.md merged

## Tasks

1. [P1] **Author e2e/README.md** — Spec inventory, tags, run instructions, testHook URL.
2. [P1] **Update docs/TESTING.md** — Tier-3 governor + smoke + a11y.
3. [P2] **Author playwright.config.ts** — Four projects (desktop + 3 mobile/tablet); webServer; tag-based selection.
4. [P2] **Author e2e/_lib/window-chonkers-types.d.ts** — Ambient types for window.__chonkers.
5. [P2] **Add testHook gate to src/scene/index.ts** — DEV+?testHook=1 gates exposure; production strips.
6. [P2] **Author e2e/_lib/governor-driver.ts** — executeActionViaUI translator + waitForTurnFlip + getState/getHistory.
7. [P3] **Author e2e/app-flow.spec.ts** — Smoke; ≤30s; passes on all 4 projects.
8. [P3] **Author e2e/governor.spec.ts** — Three @governor full games; per-turn fidelity assertion; workers=1; ≤8min.
9. [P3] **Author e2e/accessibility.spec.ts** — Five screens × two viewports; axe zero critical violations.
10. [P3] **Update package.json scripts** — test:e2e, test:e2e:smoke, test:e2e:governor, test:e2e:a11y, test:e2e:ci.
11. [P3] **Add .github/workflows/e2e-nightly.yml** — Nightly governor; trace artifacts on failure.
12. [P4] **Verify smoke runs in CI** — cd.yml runs app-flow.spec.ts; ≥10 consecutive runs without flake.
13. [P4] **Verify governor runs locally + nightly** — Three configs assert fidelity end-to-end.
14. [P4] **Verify a11y passes** — Zero critical axe violations.

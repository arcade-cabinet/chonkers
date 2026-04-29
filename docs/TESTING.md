---
title: Testing
updated: 2026-04-29
status: current
domain: quality
---

# Testing

## 4-tier pyramid

```
Tier 4 — Maestro (native Android smoke; release-candidate gate)
Tier 3 — Playwright e2e (Chromium, mobile viewports, real touch)
Tier 2 — Vitest browser (real Chromium GPU, WebGL, R3F render)
Tier 1 — Vitest node (pure logic, no DOM, no WebGL)
```

Run the lower tiers before the higher tiers — tier 1 must be green before tier 2 is meaningful.

---

## Tier 1 — Node unit tests

**Purpose:** pure TypeScript logic with no DOM, no WebGL, no React. The rules engine, win check, split-chain state machine, coordinate math, and asset manifest validation all live here.

**Where files live:** `src/**/__tests__/*.test.ts` (no `.tsx`, no `browser` in filename).

**What to cover:**
- `src/game/` — every legal-move case from `RULES.md` §4 + §5; every illegal-move rejection; win check from constructed boards.
- `src/utils/` — coords, math, type guards.
- `src/audio/roles.ts` — manifest references resolve to existing files (compile-time check via `import.meta.glob`).

**Coverage target:** ≥ 80% line coverage for `src/game/` (the rules engine is the spine — anything below 80 here is a bug). ≥ 60% elsewhere.

**How to run:**

```bash
pnpm test:node
# or
pnpm test       # node + browser tiers (skips e2e + maestro)
```

---

## Tier 2 — Browser tests (real GPU)

**Purpose:** R3F render components, Three.js material configuration, WebGL-dependent logic, visual snapshot regression.

**Where files live:** `src/**/__tests__/*.browser.test.tsx`.

**What to cover:**
- `<Board />` renders with the correct geometry and PBR material.
- `<Stack />` for stack heights 1, 3, and 6 produce stable visual snapshots.
- The split overlay open animation completes in ~160ms ± 40ms.
- HDRI loads and contributes to scene lighting (sample pixel from a controlled angle).

**How to run:**

```bash
pnpm test:browser
# or with the Vitest UI:
pnpm test:browser --ui
```

CI uses `xvfb-run` to give Chromium a virtual framebuffer.

### Visual snapshot policy

- Baselines live in `src/render/__screenshots__/`.
- Updating a baseline requires a commit body line `// visual-update: <reason >=10 words>` per `commit-gate.mjs` policy.
- Snapshots are platform-pinned via the Vitest browser runner — only run on Linux Chromium 132+ in CI.

---

## Tier 3 — Playwright E2E

**Purpose:** end-to-end flows on real browser viewports with real touch events. The split overlay's full press-hold-drag-release lifecycle. Full game playthroughs at deterministic seeds.

**Where files live:** `e2e/*.spec.ts`.

**Smoke vs nightly:**
- `pnpm test:e2e:ci` — smoke subset, runs on every PR. Target: < 3 min.
- `pnpm test:e2e:nightly` — full suite incl. determinism, stability soak. Runs on schedule.

**Mandatory smoke specs:**
- New game → red plays a 1-stack move → audio fires.
- Stack two reds → tap stack → split overlay opens → select 1 slice → hold 3s → drag off → place on adjacent cell.
- Construct a near-win position via `?seed=...` URL → execute the winning move → win screen appears.

Specs use **DOM locators**, not `page.evaluate()` against the WebGL surface — Playwright cannot reliably introspect WebGL state.

---

## Tier 4 — Maestro (native Android)

**Purpose:** sanity check the Capacitor shell on a real Android emulator. Runs on release candidates only.

**Where files live:** `maestro/*.yml`.

**Coverage:**
- Boot to title screen.
- Start new game.
- Tap a piece, see selection ring.
- Pause + resume.
- App backgrounding + foregrounding does not crash.

---

## CI test gates

`/.github/workflows/ci.yml` runs on every PR:

| Job | Tier | Required to merge |
|-----|------|-------------------|
| `core` (typecheck + lint + node tests + build) | 1 | yes |
| `browser` (Vitest browser) | 2 | yes |
| `e2e-smoke` (Playwright smoke) | 3 | yes |

Nightly tier-3 deep + tier-4 Maestro run on schedule, not on PR.

---

## Determinism

The rules engine is deterministic — given a starting state and an action sequence, the resulting state is identical across runs. There is **no RNG** anywhere in `src/game/`. Tests rely on this — any future randomness (e.g. AI opponent move selection) must be seeded and isolated to its own module under `src/ai/`, never bleeding into `src/game/`.

---

## What is NOT tested at each tier

- **Audio playback** is tested only at tier 3 (real browser). Tier 1 + 2 mock the AudioBus — they verify the *role* dispatched, not the wave output.
- **Native Capacitor APIs** (Haptics, Preferences) are mocked at tier 1–3. Tier 4 (Maestro) is the only place real native code runs.
- **Animation timing** is asserted with tolerance windows (±40ms) — never as exact frame counts.

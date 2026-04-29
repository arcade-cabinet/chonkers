# PRD: e2e/ — Playwright governor + smoke + accessibility

**Created:** 2026-04-29
**Status:** ACTIVE
**Owner:** jbogaty
**Acceptance:** Three Playwright spec files green: `app-flow.spec.ts` (smoke), `governor.spec.ts` (`@governor`-tagged AI-vs-AI driving the real UI through full games asserting fidelity to the rules engine), `accessibility.spec.ts` (a11y audit). The governor spec proves that for every AI Action emitted by `decide`, translating it to UI gestures produces the same resulting `GameState` that `stepAction(state, action)` predicts byte-equal.

**Prerequisite:** [visual-shell.prq.md](./visual-shell.prq.md) merged.

---

## Why this is its own PRD

The visual layer (`app/`) needs a fidelity test analogous to the F4 broker test at the engine layer. Where F4 proves `engine + ai + store + sim` compose correctly, the **governor** proves the visual shell faithfully reflects them through the full input-to-render pipeline.

By keeping this as its own PRD:

- The visual shell PRD ships when `pnpm dev` works end-to-end manually, without waiting for the headless e2e harness.
- The e2e PRD focuses entirely on automation infrastructure (Playwright config, dev-test exposure on `window.__chonkers`, governor state-machine, accessibility tooling).
- a11y review gets dedicated attention rather than being an afterthought to render.

---

## Goal

Land:

1. **`e2e/app-flow.spec.ts`** — smoke. Boot → title screen visible → start a match → make one move → see audio fire (poll the audio bus state) → quit. Runs in <30s. The merge gate for visual changes.

2. **`e2e/governor.spec.ts`** — `@governor`-tagged. Imports `decide` from `@/ai` directly (Playwright tests run in node + can import TS). For each turn:
   1. Read current `GameState` + history from `window.__chonkers.state` / `window.__chonkers.history` (DEV/test-only exposure).
   2. Call `decide(state, history, currentTurn, profile)` to compute the expected Action.
   3. Translate Action → UI gestures: `move` becomes click-source-then-click-destination; single-run `split` becomes click-source → click-slice-indices → press-hold-3000ms → drag-to-destination → release.
   4. Wait for the move animation to settle (poll `window.__chonkers.state.turn` to flip).
   5. Assert: `JSON.stringify(window.__chonkers.state) === JSON.stringify(stepAction(beforeState, action))` byte-equal.
   
   Run 3 full AI-vs-AI games at different difficulty/disposition combinations. Workers=1; runtime ≤8min on CI.

3. **`e2e/accessibility.spec.ts`** — `@axe`-driven audit at every screen. TitleView / SettingsView / PlayView / WinView / LoseView each visited; axe-core scan asserts no critical violations. WCAG 2.1 AA target.

4. **Test infrastructure:**
   - Playwright config (`playwright.config.ts`) with desktop-chromium project; mobile-pixel-7 project; mobile-iphone-14 project; iPad-Pro-landscape project (echoes mean-streets).
   - `e2e/_lib/governor-driver.ts` (the Action→gesture translator).
   - `e2e/_lib/window-chonkers-types.d.ts` (typed `window.__chonkers` shape).
   - DEV-only addition to `app/boot/boot.tsx`: when `import.meta.env.DEV || playwright-test-mode`, expose `window.__chonkers = { state, history, world, actions }`.

---

## Architecture

### `window.__chonkers` exposure

In `app/boot/boot.tsx`, gated behind `import.meta.env.DEV` AND a `?testHook=1` URL parameter (so production builds can never accidentally expose it):

```tsx
// app/boot/boot.tsx (additions)
if (import.meta.env.DEV && new URLSearchParams(location.search).has('testHook')) {
  Object.defineProperty(window, '__chonkers', {
    get: () => ({
      get state() {
        const match = world.queryFirst(EngineState);
        return match?.get(EngineState).gameState;
      },
      get history() {
        const match = world.queryFirst(MatchAiState);
        return match?.get(MatchAiState).history.toJSON();
      },
      world,
      actions: getActions(world),
    }),
    configurable: true,
  });
}
```

Playwright spec navigates to `http://localhost:5173/?testHook=1` to enable. Production builds strip this entirely (`import.meta.env.DEV` is `false`).

### Governor driver

```ts
// e2e/_lib/governor-driver.ts
import type { Page } from '@playwright/test';
import type { Action } from '@/engine';

export async function executeActionViaUI(page: Page, action: Action): Promise<void> {
  const fromCell = await cellSelector(page, action.from);
  await page.click(fromCell);

  if (action.runs.length === 1 && action.runs[0].indices.length === maxIndices(action)) {
    // Pure move (single run, all indices)
    const toCell = await cellSelector(page, action.runs[0].to);
    await page.click(toCell);
    return;
  }

  // Split — open overlay, select slices, hold-arm, drag-commit
  await openSplitOverlay(page, action.from);
  for (const run of action.runs) {
    for (const idx of run.indices) {
      await page.click(`[data-slice-index="${idx}"]`);
    }
  }
  await holdArm(page, 3100); // 100ms over the 3000ms threshold for safety
  for (const run of action.runs) {
    const toCell = await cellSelector(page, run.to);
    await page.dragAndDrop('[data-armed-overlay]', toCell);
    await page.waitForFunction(() => window.__chonkers.state.chain != null || /* match ended */ true);
  }
}

export async function waitForTurnFlip(page: Page, fromTurn: 'red' | 'white'): Promise<void> {
  await page.waitForFunction((from) => window.__chonkers.state.turn !== from, fromTurn);
}
```

The driver is the only translator between the AI's Action contract and the UI's gesture contract. Bugs in the driver surface as governor failures with clear diff output.

### Governor spec structure

```ts
// e2e/governor.spec.ts
test.describe('@governor full AI-vs-AI', () => {
  for (const config of GOVERNOR_CONFIGS) {
    test(`${config.red.label} red vs ${config.white.label} white, first=${config.firstPlayer}`, async ({ page }) => {
      await page.goto(`/?testHook=1&autostart=${encodeURIComponent(JSON.stringify(config))}`);
      await page.waitForFunction(() => window.__chonkers?.state != null);
      
      let turn = 0;
      while (!isTerminal(await getState(page)) && turn < 200) {
        const state = await getState(page);
        const history = await getHistory(page);
        const profile = config[state.turn];
        const action = decide(state, history, state.turn, profile);
        const beforeState = state;
        await executeActionViaUI(page, action);
        await waitForTurnFlip(page, beforeState.turn);
        const afterState = await getState(page);
        expect(JSON.stringify(afterState)).toBe(JSON.stringify(stepAction(beforeState, action)));
        turn++;
      }
      
      const final = await getState(page);
      expect(final.winner).not.toBeNull();
    });
  }
});

const GOVERNOR_CONFIGS = [
  { red: profiles.normalBalanced, white: profiles.normalBalanced, firstPlayer: 'red' },
  { red: profiles.hardAggressive, white: profiles.normalDefensive, firstPlayer: 'red' },
  { red: profiles.easyAggressive, white: profiles.hardBalanced, firstPlayer: 'white' },
];
```

Three configs is enough to prove the contract; more would just add runtime without adding signal.

---

## Tasks

### A. Documentation

#### A1. Author `e2e/README.md`

**Files:** `e2e/README.md`

**Acceptance criteria:**
- Frontmatter present
- Spec inventory + tags
- How to run locally vs CI
- `?testHook=1` URL parameter documented

#### A2. Update `docs/TESTING.md`

**Files:** `docs/TESTING.md`

**Acceptance criteria:**
- Tier-3 section reflects governor + smoke + a11y specs
- Governor's role as the visual-fidelity assertion documented

---

### B. Test infrastructure

#### B1. Author `playwright.config.ts`

**Files:** `playwright.config.ts`

**Acceptance criteria:**
- Four projects: desktop-chromium, mobile-iphone-14, mobile-pixel-7, ipad-pro-landscape
- WebServer config: `pnpm dev` on port 5173
- Tag-based test selection working (`@governor`, `@axe`)
- `governor` spec uses workers=1; smoke + a11y can parallelize

#### B2. Author `e2e/_lib/window-chonkers-types.d.ts`

**Files:** `e2e/_lib/window-chonkers-types.d.ts`

**Acceptance criteria:**
- TypeScript ambient declaration for `window.__chonkers`
- Tests get full type completion when reading the global

#### B3. Add testHook gate to `app/boot/boot.tsx`

**Description:** Gate `window.__chonkers` exposure behind `import.meta.env.DEV` AND `?testHook=1`. Production builds must strip this completely (verified via `pnpm build && grep -c '__chonkers' dist/assets/*.js` returns 0).

**Files:** `app/boot/boot.tsx`

**Acceptance criteria:**
- DEV+testHook=1 exposes window.__chonkers
- DEV without testHook does NOT expose
- Production build strips entirely

#### B4. Author `e2e/_lib/governor-driver.ts`

**Files:** `e2e/_lib/governor-driver.ts`

**Acceptance criteria:**
- `executeActionViaUI(page, action)` handles all Action shapes (pure move, single-run split, multi-run split)
- `waitForTurnFlip(page, fromTurn)` polls correctly
- `getState(page)`, `getHistory(page)` helpers
- All gesture timings tuned (hold > 3000ms with 100ms safety; drag distance > 8px commit threshold; click→click delays appropriate for animation pacing)

---

### C. Spec files

#### C1. Author `e2e/app-flow.spec.ts` — smoke

**Files:** `e2e/app-flow.spec.ts`

**Acceptance criteria:**
- Untagged (runs by default in CI)
- Boot → title visible → start match → one move → audio fired → quit
- ≤30s runtime
- Passes on all four projects (desktop + 3 mobile)

#### C2. Author `e2e/governor.spec.ts` — `@governor`

**Files:** `e2e/governor.spec.ts`

**Acceptance criteria:**
- Three full AI-vs-AI games at different config combinations
- Per-turn assertion: post-UI state byte-equals stepAction prediction
- Each game terminates with a winner
- Workers=1; ≤8min total runtime
- `pnpm test:e2e:governor` runs only this spec

#### C3. Author `e2e/accessibility.spec.ts` — `@axe`

**Files:** `e2e/accessibility.spec.ts`

**Acceptance criteria:**
- Visits TitleView, SettingsView, PlayView, WinView, LoseView (use autostart configs to deterministically reach each)
- Runs axe-core scan; asserts no critical violations
- WCAG 2.1 AA target
- Passes on desktop + iPhone-14 projects

#### C4. Update `package.json` scripts

**Files:** `package.json`

**Acceptance criteria:**
- `test:e2e` runs all e2e specs
- `test:e2e:smoke` runs untagged (smoke)
- `test:e2e:governor` runs `@governor` only with workers=1
- `test:e2e:a11y` runs `@axe` only
- `test:e2e:ci` runs smoke + a11y (governor is local/nightly, not blocking PRs)

#### C5. Add `e2e-nightly` workflow

**Description:** GitHub Actions workflow that runs `test:e2e:governor` on a schedule (nightly, 3am UTC). Captures Playwright trace artifacts on failure.

**Files:** `.github/workflows/e2e-nightly.yml`

**Acceptance criteria:**
- Workflow runs nightly
- Failures upload trace + console logs as artifacts

---

### D. Verification

#### D1. Smoke spec runs in CI

**Files:** none

**Acceptance criteria:**
- `app-flow.spec.ts` runs in `cd.yml` on push to main
- Passes consistently (≥10 consecutive runs without flake)

#### D2. Governor spec runs locally + nightly

**Files:** none

**Acceptance criteria:**
- `pnpm test:e2e:governor` passes locally
- `e2e-nightly.yml` runs successfully
- All three configs assert fidelity end-to-end

#### D3. a11y spec passes

**Files:** none

**Acceptance criteria:**
- Zero critical axe violations on any screen at any viewport
- Documented violations (if any) are not critical-tier

---

## Configuration

```yaml
batch_name: chonkers-e2e-governor
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1
```

---

## Risks

- **Animation timing flake.** UI animations take some time; the governor must wait for them to settle before reading state. Mitigated by `waitForTurnFlip` polling rather than fixed timeouts. If still flaky, add explicit "settle" markers in the UI (a `data-settled="true"` attribute on the canvas root after each animation completes).
- **Driver gesture mismatch.** Holding 3000ms via Playwright's `page.mouse.down()` + `page.waitForTimeout(3100)` may not fire the same `pointerdown`-keep-alive sequence the input pipeline expects. Mitigated by testing with longer holds in B1 + adding diagnostic `data-arm-state` attributes the driver can poll.
- **CI runtime budget.** Governor at 8min × workers=1 is significant. Mitigated by making governor nightly-only (not PR-blocking); smoke + a11y are PR-blocking.
- **iOS/iPad project flake.** Mobile webkit projects can be flaky; mitigated by retries=2 on those projects only.

---

## Definition of Done

- All A* docs merged.
- All B* infrastructure merged.
- All C* specs merged.
- D1–D3 verifications pass.
- `pnpm test:e2e:smoke` ≤30s, green.
- `pnpm test:e2e:governor` ≤8min, green.
- `pnpm test:e2e:a11y` zero critical violations.
- Nightly workflow green for one consecutive week.

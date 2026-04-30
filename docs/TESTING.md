---
title: Testing
updated: 2026-04-29
status: current
domain: quality
---

# Testing

Two axes:

- **Tier** — execution context (Node logic / browser GPU / Playwright e2e / Maestro native).
- **Stage** — scale of automated runs (alpha 100, beta 1000, rc 10000).

The tiers are *where* tests run. The stages are *how many runs* drive the coverage of the broker / governor specs that exercise the whole game end-to-end.

---

## The four tiers

```
Tier 4 — Maestro (native Android + iOS smoke; rc gate)
Tier 3 — Playwright e2e (Chromium, mobile viewports, real touch + GPU)
Tier 2 — Vitest browser (real Chromium GPU, WebGL, R3F render, capacitor-sqlite OPFS)
Tier 1 — Vitest node (pure TypeScript, no DOM, no WebGL, better-sqlite3 ad-hoc DBs)
```

Run the lower tiers before the higher tiers. Tier 1 must be green before tier 2 is meaningful.

### Tier 1 — Node tests

**Purpose:** pure TypeScript logic. Engine rules, AI search, store CRUD, analytics aggregates, Zobrist hashing, coord math, manifest validation, schema correctness, migration replay, repo CRUD, transaction semantics.

**Where files live:** `src/**/__tests__/*.test.ts` — no `.tsx`, no `.browser.` in filename.

**Database tier:** Tier 1 owns the bulk of `src/persistence/sqlite/` coverage via `makeTestDb()` (in-memory `better-sqlite3` by default; on-disk under `CHONKERS_TEST_DB_DIR` for diagnostic inspection — see `docs/DB.md`). The same drizzle schema and the same migration files run here as in production runtime.

**What to cover:**
- `src/engine/` — every legal-move case from `RULES.md` §4 + §5; every illegal-move rejection; win check from constructed boards; split-chain state machine; Zobrist hash collision behaviour.
- `src/ai/` — `chooseAction` determinism (same state + profile → same action); `dumpAiState`/`loadAiState` round-trip identity; profile feature evaluation against constructed boards; forfeit-threshold trigger conditions.
- `src/sim/` — broker dispatch logic, save/resume routing, mid-chain pause+resume.
- `src/store/` — every repo's CRUD against `makeTestDb`; transaction rollback on error.
- `src/persistence/sqlite/` — migration forward-replay determinism, version-detection logic, schema correctness against drizzle definitions.
- `src/analytics/` — aggregate refresh produces stable values for fixed match histories.
- `src/utils/` — coords, math, type guards.

**No mocks.** Each layer's tests use the real layer below it. The Tier-1 `makeTestDb` is *real* SQLite via `better-sqlite3`, not a fake. The sim broker test exercises real engine + real AI + real store + real db. Mocks are forbidden by doctrine; the no-mocks rule is a load-bearing part of how the alpha/beta/rc cycles deliver signal.

**Coverage target:** ≥ 90% line coverage for `src/engine/`, `src/ai/search.ts`, `src/persistence/sqlite/`. ≥ 70% elsewhere. Coverage is measured but not gated — the broker run-count thresholds are the actual quality gate.

**How to run:**

```bash
pnpm test:node
# diagnostic mode — write each test's DB to disk for inspection
CHONKERS_TEST_DB_DIR=/tmp/chonkers-debug pnpm test:node
```

### Tier 2 — Browser tests (real GPU)

**Purpose:** anything that requires a real browser. R3F render components, Three.js material configuration, WebGL state, visual snapshot regression, capacitor-sqlite OPFS persistence, capacitor-preferences platform routing on web.

**Where files live:** `src/**/__tests__/*.browser.test.{ts,tsx}` and `app/**/__tests__/*.browser.test.tsx`.

**What to cover:**
- `<Board />` renders with the correct geometry and PBR material.
- `<Stack />` for stack heights 1, 3, and 6 produce stable visual snapshots.
- The split overlay open animation completes in ~160ms ± 40ms.
- HDRI loads and contributes to scene lighting.
- `kv` round-trips JSON values through real Capacitor Preferences (under `localStorage` on the web tier).
- `src/persistence/sqlite/` bootstrap path: first run imports `public/game.db` into OPFS; second run is a no-op; drift detection triggers migration replay.

**Database tier:** Tier 2 covers ONLY the bootstrap-and-replay flow. CRUD-shape, schema correctness, transaction semantics — all that lives in Tier 1. Tier 2 is just "does the runtime adapter actually work against real capacitor-sqlite + OPFS."

**How to run:**

```bash
pnpm test:browser
pnpm test:browser --ui   # Vitest UI mode
```

CI uses `xvfb-run` for a virtual framebuffer.

#### Visual snapshot policy

- Baselines live in `app/canvas/__screenshots__/`.
- Updating a baseline requires a commit body line `// visual-update: <reason ≥10 words>` per `commit-gate.mjs` policy.
- Snapshots are platform-pinned to the CI runner's Chromium build; local runs on different platforms compare against the same pinned image (small differences land as test failures, not silent drift).

### Tier 3 — Playwright e2e

**Purpose:** end-to-end flows on real browser viewports with real touch events. The split overlay's full press-hold-drag-release lifecycle. Full match playthroughs at deterministic seeds. The governor spec at the heart of the alpha/beta/rc cadence.

**Where files live:** `e2e/*.spec.ts`.

**The governor spec.** `e2e/governor.spec.ts` runs N AI-vs-AI matches end-to-end through the real R3F + Radix + framer-motion + audio + capacitor-sqlite stack. N is parameterised by environment:

| Env | N | When |
|---|---:|---|
| `GOVERNOR_RUNS=alpha` | 100 | local runs and PR-gating CI for alpha-stage validation |
| `GOVERNOR_RUNS=beta` | 1000 | scheduled CI nightly during beta stage |
| `GOVERNOR_RUNS=rc` | 10000 | scheduled CI weekly during rc stage; full balance + perf trace collection |

The governor spec records every match's `coin_flip_seed` + profile pair + `position_hash_after` per ply, so any outlier match found at rc-stage (e.g. an unresolved 2000-ply match) is replayable from the recorded seed.

**Smoke vs governor:**
- `pnpm test:e2e:ci` — smoke subset, runs on every PR. Target: < 3 min. Single-match flows + UI smoke.
- `pnpm test:e2e:governor` — governor spec, parameterised by `GOVERNOR_RUNS`.

**Mandatory smoke specs:**
- New game → red plays a 1-stack move → audio dispatches the `move` role.
- Stack two reds → tap stack → split overlay opens → select 1 slice → hold 3s → drag off → place on adjacent cell.
- Construct a near-win position via `?seed=...` URL → execute the winning move → win screen + voice line.
- Forfeit button → game-over sting + opponent's voice line.

Specs use **DOM locators**, not `page.evaluate()` against the WebGL surface — Playwright cannot reliably introspect WebGL state.

### Tier 4 — Maestro (native iOS + Android)

**Purpose:** sanity check the Capacitor shell on real platform emulators. Runs on rc-stage candidates only.

**Where files live:** `maestro/*.yml`.

**Coverage:**
- Boot to lobby on each platform.
- Start a new match → AI plays its first move within `time_budget_ms` for the chosen profile.
- Tap a piece, see selection ring.
- Pause + resume.
- App backgrounding + foregrounding does not crash and does not lose match state (capacitor-sqlite OPFS persistence + AI dump_blob round-trip).
- Forfeit from native HUD.
- Native haptic on split-arm.

---

## The three stages

The validation cadence is captured in `docs/STATE.md`. Each stage has its own bias and gate:

| Stage | Run count | Bias | Gate to next stage |
|---|---:|---|---|
| **alpha** | 100 broker runs (Tier 1, no UI) + 100 governor runs (Tier 3) | unit-exercising end-to-end; surface contract bugs and obvious balance issues | every PRQ landed; alpha governor green; first AI-weight tune committed (see `docs/AI.md` "Tuning history") |
| **beta** | 1000 governor runs (Tier 3) | playtesting under real visual + audio + UI stack at higher statistical power | beta governor green; second AI-weight tune committed; visual snapshots stable |
| **rc** | 10000 governor runs (Tier 3) + Maestro (Tier 4) on iOS + Android | outlier hunting; perf profiling; final balance tune | rc governor green; no unresolved-match outliers above noise threshold; Maestro green on both platforms; final AI-weight tune committed; perf within budget |

The 100-run broker pass is a Tier-1 spec under `src/sim/__tests__/broker.test.ts`. It runs the full game loop without any rendering. This is the *cheapest* end-to-end signal — if it fails, the more expensive governor passes will too. Run it first, run it on every PR.

The 100/1000/10000 governor passes use the same `e2e/governor.spec.ts` parameterised by `GOVERNOR_RUNS`. There's no separate "governor lite" + "governor full" — the same code, more iterations, different scheduling cadence.

### Outlier handling

A run is an "unresolved-match outlier" if the match exceeds `MAX_PLY_LIMIT` (default 1000) without a winner or forfeit. This isn't a draw — chonkers has no draw rule (see `RULES.md` §7) — it's an AI evaluation gap. The governor spec records the match metadata to a separate `outliers/` directory:

- `outliers/<run-id>/<match-id>.json` — full match record (ID, profiles, seed, opening hash, every move, every position hash, AI think-time per move).
- `outliers/<run-id>/summary.csv` — one row per outlier with profile pair + ply count + final position hash.

After each governor pass, an analysis pass triages outliers:

- **rate < 0.001%** — noise, no action.
- **rate 0.001–0.05%** — investigate the dominant profile pair; balance-tune the relevant weights.
- **rate > 0.05%** — block stage progression; the AI's evaluation function has a structural blind spot that needs an algorithmic fix, not just a tune.

Outliers are not flaky tests. They're real games the AI played. Replaying any outlier from its `coin_flip_seed` + recorded moves reproduces the same game deterministically, which makes algorithmic diagnosis tractable.

---

## CI gates

`.github/workflows/ci.yml` runs on every PR:

| Job | Tier | Required to merge |
|---|---|---|
| `core` (typecheck + lint + Tier 1 tests + build) | 1 | yes |
| `browser` (Tier 2 — Vitest browser) | 2 | yes |
| `e2e-smoke` (Tier 3 smoke subset) | 3 | yes |
| `governor-alpha` (Tier 1, 100-run broker spec via `pnpm test:alpha`) | 1 | yes during alpha and later stages |

Scheduled jobs (not PR-gating):
- Nightly: `governor-beta` (1000 runs) during beta stage.
- Weekly: `governor-rc` (10000 runs) + Maestro (Tier 4) during rc stage.

Stage transitions update which scheduled jobs activate.

---

## Determinism contract

Chonkers' deterministic core is the load-bearing assumption that makes outlier replay possible:

1. **Engine** is pure. No RNG. Same state + same action → same next state.
2. **AI** is deterministic per `docs/AI.md`. No PRNG inside `chooseAction`. Same state + same profile → same action.
3. **Sim broker** uses `crypto.getRandomValues()` exactly once per match — to derive `coin_flip_seed`. After that single sample, the entire match is a deterministic function of (engine + AI + recorded actions).

The `commit-gate` PreToolUse hook bans `Math.random()` and `Math.randomBytes()` in `src/{engine,ai,sim,store}/`. The broker's coin-flip is the documented exception, isolated to one location.

This contract is what makes the rc-stage 10000-run pass tractable. An outlier match is a recorded `(seed, profiles, opening)` tuple that re-derives the same ply sequence on replay. Without determinism, the rc cycle would surface unreproducible failures and have no diagnostic path.

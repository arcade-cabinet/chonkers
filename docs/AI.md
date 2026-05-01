---
title: AI
updated: 2026-04-29
status: current
domain: technical
---

# AI

`src/ai/` is chonkers' opponent. It plays the same rules every human plays — `RULES.md` is the only source of truth for legal moves. The AI is **deterministic**: given identical state and identical profile, it always returns the identical action. Variation across matches comes from the state-history difference, not from a random number generator.

## Architecture

```
                    ┌──────────────────────────┐
                    │  Engine state (3D occu.) │
                    │  src/engine/             │
                    └──────────┬───────────────┘
                               │ readonly snapshot
                               ▼
        ┌──────────────────────────────────────────────┐
        │  Yuka Graph state-space model                │
        │  src/ai/graph.ts                              │
        │   nodes:  reachable game states               │
        │   edges:  legal actions (move, split, forfeit)│
        └──────────┬───────────────────────────────────┘
                   │ candidate actions, edge weights
                   ▼
        ┌──────────────────────────────────────────────┐
        │  Alpha-beta minimax search                    │
        │  src/ai/search.ts                             │
        │   depth = profile.search_depth                │
        │   evaluation = profile.weights · features     │
        │   prune threshold = profile.prune_aggression  │
        └──────────┬───────────────────────────────────┘
                   │ chosen Action
                   ▼
        ┌──────────────────────────────────────────────┐
        │  Sim broker (src/sim/) applies Action        │
        │  via engine reducer                          │
        └──────────────────────────────────────────────┘
```

The Yuka Graph models reachable game states as nodes and legal transitions as weighted edges. Alpha-beta minimax searches the graph to a profile-specific depth, applying the profile's force-multiplier weights to a fixed feature vector.

**No PRNG.** None of `Math.random()`, `crypto.getRandomValues()`, or any seeded RNG appears in `src/{engine,ai,sim,store}/`. The `commit-gate` PreToolUse hook bans `Math.random()` in those packages.

## Determinism contract

The AI is contractually deterministic on three guarantees. Each guarantee
specifies its scope precisely — the contract holds in **search-depth-pinned
mode** (used during replay and during alpha/beta/rc governor runs); it is a
**fairness contract** in **time-budget mode** (the production live-play
path). The two modes are documented below.

1. **Same state, same profile, same mode → same action.** `chooseAction(state: GameState, profile: Profile, mode: 'live' | 'replay'): Action` is a pure function of its three arguments. Calling it twice with structurally-equal inputs yields the same output.

2. **Same dump, same load → behaviourally equivalent state.** `loadAiState(dumpAiState(s))` produces an `AiState` `s'` such that for every game state `g` and mode `m`: `chooseAction(g, profile_of(s), m, s) === chooseAction(g, profile_of(s'), m, s')`. The states are not required to be bit-equal — the transposition table is a perf cache and may be repacked on dump/load — but they must produce the same actions for all inputs. The dump format is an opaque BLOB with a monotonic format-version integer (4 bytes, little-endian) following a 4-byte magic `'CHAI'`.

3. **Same match seed, same profile pair, same opening → same game (replay mode).** Given a `MatchHandle`'s recorded `coinFlipSeed`, `redProfile`, and `whiteProfile`, **re-running the match in `replay` mode** reproduces the exact ply sequence. This makes outlier-replay possible at rc-stage 10,000-run scale via the governor spec's per-match filesystem artifacts.

### `live` vs `replay` mode

| Aspect | `live` | `replay` |
|---|---|---|
| Search depth | iterative deepening, capped by `time_budget_ms` (host-speed-dependent) | pinned to `profile.search_depth` (host-speed-independent) |
| Action determinism | guaranteed for fixed (state, profile, hardware) — NOT across hardware | guaranteed for fixed (state, profile) — across all hardware |
| Use | production live play under user pressure | governor runs (alpha/beta/rc), outlier diagnosis, post-match replay UI |

`live` mode is what humans face. The AI thinks for up to `time_budget_ms` and returns the best move found within that budget. This is host-speed-dependent — a faster CPU completes deeper iterations within the budget — so two players on different hardware playing the same opening would face slightly different opponents. That's acceptable for fairness in production (everyone gets the same effective difficulty curve relative to their device's capability).

`replay` mode is what the governor runs, what outlier-replay uses, and what the post-match replay UI consumes. It pins search to exactly `profile.search_depth` plies and ignores `time_budget_ms` entirely. This produces a deterministic, host-independent ply sequence from the recorded `(seed, profiles, opening)` tuple. Replay mode is slower per move on average (no early-out) but bounded.

The governor spec at every stage runs in `replay` mode. The 100/1000/10000-run cycles produce balance data that's reproducible across machines. An outlier match found on CI can be re-played locally and surface the same divergent decision tree.

## The 9 profiles

Profiles span a 3×3 grid: **disposition** (aggressive, balanced, defensive) × **difficulty** (easy, medium, hard). Every match selects one profile per side. Hot-seat humans use `human` (no AI dispatch); the AI never appears on a side whose profile is `human`.

| Profile key | Disposition | Difficulty |
|---|---|---|
| `aggressive-easy` | aggressive | easy |
| `aggressive-medium` | aggressive | medium |
| `aggressive-hard` | aggressive | hard |
| `balanced-easy` | balanced | easy |
| `balanced-medium` | balanced | medium |
| `balanced-hard` | balanced | hard |
| `defensive-easy` | defensive | easy |
| `defensive-medium` | defensive | medium |
| `defensive-hard` | defensive | hard |

Disposition shapes **what the AI values**. Difficulty shapes **how deeply it thinks**.

## Feature vector

The evaluation function scores any board state from a player's perspective as a weighted sum of features. Features are computed by `src/ai/features.ts` against an engine `GameState` and a player colour. All features are real-valued; positive features favour the player, negative features favour the opponent.

| Feature | Meaning | Range (typical) |
|---|---|---|
| `forward_progress` | sum of (rows-toward-opponent-home) for every top-of-stack the player owns. The whole game IS getting tops to the far row. | 0..120 |
| `top_count` | number of stacks whose top piece is the player's colour. Directly the win condition. | 0..12 |
| `home_row_tops` | number of player's top-of-stacks already on the opponent's home row. Wins at 12. | 0..12 |
| `chonk_opportunities` | count of legal chonks the player can make this turn. | 0..~40 |
| `tall_stack_count` | number of player-owned top-of-stacks of height ≥ 3. Tall stacks dominate but are vulnerable to blockers. | 0..~6 |
| `blocker_count` | number of player's 1-stacks adjacent to opponent's tall stacks (acts as area-denial — RULES §4.2). | 0..~10 |
| `chain_owed` | number of pieces the player still owes from a forced-split chain (RULES §5.4). Negative because owing pieces is a tempo loss. | 0..6 |
| `opponent_forward_progress` | mirror of `forward_progress` for the opponent. Negative. | 0..120 |
| `opponent_home_row_tops` | mirror of `home_row_tops` for the opponent. Heavily negative — opponent winning is the worst outcome. | 0..12 |
| `opponent_tall_stacks_unblocked` | opponent tall stacks with no player blocker adjacent. Negative. | 0..~6 |
| `total_pieces_advancement` | sum of `(stack_height × distance-toward-goal)` over owned cells — credits BURIED pieces, not just tops. Counters the row-vs-row standoff where flat 1-stack walls form. | 0..~720 |
| `mobile_threat_count` | count of player's owned stacks with height ≥ 2 (splittable + chonk-capable). Heavily rewarded — without 2+stacks the player has no offensive leverage past the 1-stack blocker line (RULES §4.2). | 0..12 |
| `frontier_advance` | max distance-toward-goal of any owned top. Rewards committing a salient lone advancer that forces the opponent to defend rather than mirror. | 0..10 |
| `even_trade_count` | count of player 1-stacks adjacent to opponent 1-stacks. Each is a free chonk that costs the opponent a piece and gives us a 2-stack on their cell. | 0..~30 |
| `cluster_density` | unordered (own, own) cell pairs at Chebyshev-1. Rewards clustering — mutual support, defensive walls. Disposition-modulated: defensive +2.5, balanced +1.0, aggressive +0.3. | 0..~40 |
| `longest_wall` | length of the longest contiguous horizontal run of own owned cells on a single row. Defensive formations. Defensive +1.5, balanced +0.5, aggressive +0.0. | 0..9 |
| `funnel_pressure` | count of opponent cells with ≥ 2 of our pieces in their 8-neighbourhood. Encirclement / funnel formations. Aggressive +4.0, balanced +2.0, defensive +0.5. | 0..12 |

A profile's `weights` map associates each feature with a real-valued multiplier. The evaluation is `sum(features[k] × weights[k])`.

## Profile weight tables

These are **theoretical first-cut weights** committed as the alpha-stage starting values. They are tuned from balance data measured during the alpha (100-run), beta (1000-run), and rc (10000-run) cycles. Each tune is a documented commit edit to this table, with the previous values preserved in the "Tuning history" section at the end.

### Disposition shapes — the weight ratios

The disposition determines the **ratio** between feature weights. Difficulty applies a uniform scale on top.

| Feature | aggressive | balanced | defensive |
|---|---:|---:|---:|
| `forward_progress` | +3.0 | +2.0 | +1.5 |
| `top_count` | +1.0 | +1.5 | +2.0 |
| `home_row_tops` | +20.0 | +20.0 | +20.0 |
| `chonk_opportunities` | +4.0 | +2.5 | +1.0 |
| `tall_stack_count` | +2.5 | +1.5 | +0.8 |
| `blocker_count` | +0.5 | +1.5 | +3.0 |
| `chain_owed` | -2.0 | -2.0 | -2.0 |
| `opponent_forward_progress` | -1.5 | -2.0 | -3.0 |
| `opponent_home_row_tops` | -25.0 | -25.0 | -25.0 |
| `opponent_tall_stacks_unblocked` | -1.0 | -2.0 | -3.5 |
| `total_pieces_advancement` | +1.0 | +0.7 | +0.5 |
| `mobile_threat_count` | +5.0 | +3.5 | +2.0 |
| `frontier_advance` | +3.0 | +2.0 | +1.0 |
| `even_trade_count` | +6.0 | +3.5 | +2.0 |
| `cluster_density` | +0.3 | +1.0 | +2.5 |
| `longest_wall` | +0.0 | +0.5 | +1.5 |
| `funnel_pressure` | +4.0 | +2.0 | +0.5 |

Reading the table:

- **aggressive** weights `chonk_opportunities`, `even_trade_count`, `funnel_pressure` highest — actively seeks trades, encircles opponent groups, builds tall stacks (`mobile_threat_count`) to push through. Low cluster preference.
- **defensive** weights `blocker_count`, `opponent_tall_stacks_unblocked`, `cluster_density`, `longest_wall` highest — places 1-stack blockers, builds walls, keeps pieces in mutual support, denies opponent area.
- **balanced** is the midpoint — modest weights everywhere; clusters defensively but takes trades when offered.
- The win-condition features (`home_row_tops`, `opponent_home_row_tops`) are equal across all three dispositions and dominant in magnitude. No profile is willing to lose to win an aesthetic; winning is winning.

#### Why cluster + threat features matter

Without `mobile_threat_count`, `even_trade_count`, and `funnel_pressure`, the alpha governor pegged 100% at the ply cap (RULES §4.2 standoff: a 1-stack blocks any taller stack, so the AI sat behind row-4-vs-row-6 walls and mirrored). The fix wasn't deeper search — it was teaching the eval that **building 2-stacks** + **executing 1-vs-1 trades** is how you create the higher-stack interaction the rules require for a piece-capture cascade. The 100-run alpha gate now resolves 100/100.

### Difficulty shapes — search depth + prune aggressiveness

| Difficulty | `search_depth` | `prune_aggression` | `time_budget_ms` |
|---|---:|---:|---:|
| easy | 2 | 0.40 | 200 |
| medium | 4 | 0.20 | 800 |
| hard | 6 | 0.05 | 3000 |

- `search_depth` — alpha-beta minimax horizon in plies. Higher = stronger play.
- `prune_aggression` — fraction of expected branches eliminated by alpha-beta cutoff at each layer. Higher = faster but weaker (more legal moves discarded).
- `time_budget_ms` — soft cap on per-move think time. The search uses iterative deepening and returns the best move found within the budget if it can't complete the full `search_depth`. This bounds the AI's contribution to per-match wall-clock time during 1000-run governor and 10000-run rc passes.

Difficulty does NOT change the disposition's feature ratios — an easy aggressive plays the same *style* as a hard aggressive, just with shallower lookahead.

## Forfeit as an action

The action set returned by `chooseAction` includes `forfeit` alongside `move` and `split`. The AI considers forfeit when its evaluation drops below a per-profile threshold:

| Profile family | `forfeit_threshold` (eval below this triggers forfeit consideration) |
|---|---:|
| aggressive-* | -200.0 (essentially never forfeits — fights to the last piece) |
| balanced-* | -120.0 (forfeits in clearly-lost positions, e.g. opponent has 10/12 tops on the home row) |
| defensive-* | -80.0 (forfeits earlier than balanced once the position is hopeless) |

When the threshold is crossed, the AI evaluates "forfeit now" against "play one more move." If forfeiting is no worse than the best available move, the AI forfeits. The broker records the winner as the OPPOSITE color of the forfeiter on `handle.game.winner`, and the scene layer triggers the standard game-over sting + the *opponent's* victory voice line.

Humans get a forfeit slice in the pause radial that runs the same code path: same sting, same audio cue, same winner record.

## State representation

`src/ai/state.ts` defines the AI-side opaque state:

```ts
interface AiState {
  readonly profileKey: ProfileKey;
  readonly searchTreeCache: SearchTreeCache;       // pruned alpha-beta tree from the previous turn
  readonly transpositionTable: TranspositionTable; // Zobrist-keyed evaluation memo
  readonly chainPlannedRemainder: ReadonlyArray<readonly number[]> | null;
  // ^ when mid-forced-split-chain, the AI's planned continuation
}
```

The transposition table and the search-tree cache are **performance hints**, not load-bearing state: they let the AI skip work it already did on a recent turn but do not affect the chosen action. Per the determinism contract above, dump/load is required to produce a behaviourally-equivalent `AiState`, not a bit-equal one — the implementation may rebuild the transposition table during `loadAiState` rather than serialising it, or may serialise a pruned subset.

The single source of format-version truth is the **blob's 4-byte little-endian `format_version` field** (described in `dumpAiState` / `loadAiState` below). The `AiState` interface itself does not carry a version — the version is a property of the *serialised representation*, not the in-memory structure.

## `dumpAiState` / `loadAiState`

```ts
// src/ai/index.ts
export function dumpAiState(state: AiState): Uint8Array;
export function loadAiState(blob: Uint8Array): AiState;
```

The dump is a forward-versioned BLOB: a 4-byte magic `'CHAI'`, a 4-byte little-endian `format_version` (currently `1`), then a serialised payload. The serialiser uses CBOR (compact binary object representation) — smaller than JSON, deterministic byte order for stable hashes, native support for `Uint8Array` and integers.

`loadAiState` reads the format_version first. Version `1` is the only one that exists and is unlikely to change — yuka is a frozen rope and the dump payload is minimal (`profileKey` + `chainPlannedRemainder`). If the format ever changes, `loadAiState` throws on resume, the active-match snapshot is treated as corrupt by the persistence layer, and the player starts fresh. No `migrateAiState` ladder exists — the cost-benefit doesn't justify it for a casual game.

The dump-blob is base64-encoded inside the `ActiveMatchSnapshot.{red,white}AiDumpB64` field — see `docs/PERSISTENCE.md`. Resume restores both yuka brains in one read of the active-match KV slot.

## Coin flip for first move

Red moves first per RULES §3, but **which player is red** is decided per-match. The sim broker generates a `coinFlipSeed` (a UUID-derived 64-bit integer) at match-creation time and stores it on `MatchHandle.coinFlipSeed`. The broker uses that seed to deterministically pick which of the two players plays red.

This is the **only** entropy in chonkers. After this single sample, the rest of the match is a deterministic function of (engine rules, AI profiles, recorded actions). Replaying the match — for outlier debugging during governor runs — re-derives the same colour assignment from the same seed and produces the same game. The active-match snapshot persists `coinFlipSeed` so resume reproduces play deterministically.

The seed is generated by the platform's `crypto.getRandomValues()` at match-creation time only. **`crypto.getRandomValues` is not banned in the broker** — only in the engine, AI, sim core, and store. The broker is the legitimate entropy source for one-shot match initialisation.

## What lives in code, not the database

The 9 profile keys + their weight tables + their search depths + their forfeit thresholds are **TypeScript constants** in `src/ai/profiles.ts`. The values change via balance-tune commits during alpha/beta/rc; tracked as conventional-commit `feat(ai): tune balanced-medium forfeit threshold` edits with reviewable diffs. `MatchHandle.{redProfile,whiteProfile}` is a `ProfileKey` literal validated by `isProfileKey` at handle-creation time.

## Tuning history

The tables above are the **alpha-stage initial weights**. As balance data lands from the 100/1000/10000 runs, this section records each tune.

### alpha-stage initial (2026-04-29)

Authored from theoretical reasoning over the chonkers feature set. The original 10-feature vector + 3 disposition weight tables. Alpha 100-run governor against this vector pegged 100% at the ply cap — the AI sat behind row-4-vs-row-6 1-stack walls and mirrored sideways indefinitely.

### alpha tune 1 — cluster + threat features (2026-04-30)

Added 7 new features (`total_pieces_advancement`, `mobile_threat_count`, `frontier_advance`, `even_trade_count`, `cluster_density`, `longest_wall`, `funnel_pressure`) to break the standoff. All three disposition weight tables expanded with disposition-modulated values for the cluster/funnel features (defensive favours walls + density; aggressive favours funnels + threats; balanced is the midpoint). Existing weights retuned: `top_count` lowered (was over-rewarding flat 1-stack preservation), `chonk_opportunities` raised 2-3× (actually take the chonk).

**Result**: 100-run alpha 100/100 finishers, 0 outliers, avgPly 111.27. Per-pairing wins (red-white):
- aggressive-easy vs balanced-easy: 0-34 (avgPly 168)
- balanced-easy vs defensive-easy: 33-0 (avgPly 92)
- defensive-easy vs aggressive-easy: 0-33 (avgPly 71)

3-way intransitivity is acceptable alpha-stage signal; balanced dominates both extremes which is rough but expected (it has the most-tuned mix). Beta governor will sample more pairings + run aggressive-vs-aggressive, etc.

### governor-rotation infra (2026-05-01) — NOT a weight change

Two attempted weight tunes against the alpha 100-run data both stalled the broker gate (matches running to 200-ply outliers). The tune attempts were reverted; root cause was insufficient signal:

- The alpha 100-run only samples 3 of 9 ordered pairings (aggressive-easy×balanced-easy, balanced-easy×defensive-easy, defensive-easy×aggressive-easy) at 33 matches each — too small a sample for confident weight-direction inference.
- The beta governor was running `runs=1000` of a single hardcoded pairing (`balanced-medium vs balanced-medium`, the default in `src/scene/index.ts startNewMatch`). 1000 of one pairing tells you nothing about cross-disposition balance.

**Infra fix**: `startNewMatch` accepts an optional `{ redProfile, whiteProfile }` pair (testHook-exposed), and `e2e/governor.spec.ts` now cycles through all 9 ordered (red, white) pairings on the easy tier. With `runs=1000` each pairing gets ~111 matches — enough power for the directive's 60/40 win-rate gate. Per-pairing stats are accumulated and soft-asserted at the end of the run with a console-logged summary so the full balance picture surfaces even when one pairing is out of band.

No weight values changed. The next entry will record the FIRST data-driven tune once the new rotated 1000-run lands.

### (next entries appended on each balance tune)

Each entry records:

- The run cycle that fed the tune (alpha 100-run, beta 1000-run, rc 10000-run, or an interim ad-hoc tune)
- Which weights / depths / thresholds changed and by how much
- The balance signal that motivated the change (e.g. "aggressive-hard won 73% vs defensive-hard at alpha — too high; reduced `chonk_opportunities` weight from +1.5 to +1.1")
- The match-sample signature (number of matches counted, governor run-id) for reproducibility

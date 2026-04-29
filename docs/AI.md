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

The AI is contractually deterministic on three guarantees:

1. **Same state, same profile → same action.** `chooseAction(state: GameState, profile: Profile): Action` is a pure function. Calling it twice with structurally-equal inputs yields the same output.
2. **Same dump, same load → same state.** `loadAiState(dumpAiState(s)) ⊨ s` is the round-trip identity for any AI state `s`. The dump format is opaque BLOB + monotonic format-version integer.
3. **Same match seed, same profile pair, same opening → same game.** Given recorded `coin_flip_seed`, `red_profile`, `white_profile`, and `opening_position_hash` from a `matches` row, replaying the match through the same chonkers code reproduces the exact ply sequence — including AI think-times within a tolerance window. This makes outlier-replay possible at rc-stage 10,000-run scale.

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

A profile's `weights` map associates each feature with a real-valued multiplier. The evaluation is `sum(features[k] × weights[k])`.

## Profile weight tables

These are **theoretical first-cut weights** committed as the alpha-stage starting values. They are tuned from balance data measured during the alpha (100-run), beta (1000-run), and rc (10000-run) cycles. Each tune is a documented commit edit to this table, with the previous values preserved in the "Tuning history" section at the end.

### Disposition shapes — the weight ratios

The disposition determines the **ratio** between feature weights. Difficulty applies a uniform scale on top.

| Feature | aggressive | balanced | defensive |
|---|---:|---:|---:|
| `forward_progress` | +3.0 | +2.0 | +1.5 |
| `top_count` | +2.0 | +2.0 | +2.5 |
| `home_row_tops` | +20.0 | +20.0 | +20.0 |
| `chonk_opportunities` | +1.5 | +0.8 | +0.3 |
| `tall_stack_count` | +2.5 | +1.5 | +0.8 |
| `blocker_count` | +0.5 | +1.5 | +3.0 |
| `chain_owed` | -2.0 | -2.0 | -2.0 |
| `opponent_forward_progress` | -1.5 | -2.0 | -3.0 |
| `opponent_home_row_tops` | -25.0 | -25.0 | -25.0 |
| `opponent_tall_stacks_unblocked` | -1.0 | -2.0 | -3.5 |

Reading the table:

- **aggressive** weights `forward_progress` and `chonk_opportunities` highest — pushes its own pieces forward, looks for stacking opportunities, accepts opponent counter-progress as the cost of pace.
- **defensive** weights `blocker_count` and `opponent_tall_stacks_unblocked` highest — places 1-stack blockers, denies opponent area, slow-rolls forward progress.
- **balanced** is the midpoint — modest weights on both attack and defence, no extreme.
- The win-condition features (`home_row_tops`, `opponent_home_row_tops`) are equal across all three dispositions and dominant in magnitude. No profile is willing to lose to win an aesthetic; winning is winning.

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

When the threshold is crossed, the AI evaluates "forfeit now" against "play one more move." If forfeiting is no worse than the best available move, the AI forfeits. The `matches.winner` column records `forfeit-red` or `forfeit-white` depending on which side gave up; the sim broker triggers the standard game-over sting + the *opponent's* victory voice line.

Humans get a forfeit button in the HUD that runs the same code path on the human side: same sting, same audio cue, same `matches.winner` value.

## State representation

`src/ai/state.ts` defines the AI-side opaque state:

```ts
interface AiState {
  readonly profileKey: ProfileKey;
  readonly searchTreeCache: SearchTreeCache;       // pruned alpha-beta tree from the previous turn
  readonly transpositionTable: TranspositionTable; // Zobrist-keyed evaluation memo
  readonly chainPlannedRemainder: ReadonlyArray<readonly number[]> | null;
  // ^ when mid-forced-split-chain, the AI's planned continuation
  readonly profileFormatVersion: 1;
}
```

The transposition table and the search-tree cache are perf optimisations: they let the AI skip work it already did on a recent turn. They do not affect the chosen action — only how fast the choice arrives. They're part of the `AiState` so dump/resume preserves performance characteristics across save boundaries.

## `dumpAiState` / `loadAiState`

```ts
// src/ai/index.ts
export function dumpAiState(state: AiState): Uint8Array;
export function loadAiState(blob: Uint8Array): AiState;
```

The dump is a forward-versioned BLOB: a 4-byte magic `'CHAI'`, a 4-byte little-endian `format_version` (currently `1`), then a serialised payload. The serialiser uses CBOR (compact binary object representation) — smaller than JSON, deterministic byte order for stable hashes, native support for `Uint8Array` and integers.

`loadAiState` reads the format_version first. Version `1` is the only one that exists. Future versions add a `migrateAiState(blob: Uint8Array, fromVersion: number, toVersion: number): Uint8Array` step before parsing, applied during `loadAiState` if `format_version < CURRENT_VERSION`. This mirrors the SQL migration ladder for the database — forward-only, monotonic, never edit a shipped version.

The dump-blob lives in `ai_states.dump_blob` (see `docs/DB.md`); the format version goes in `ai_states.dump_format_version`. Resume reads exactly one row per AI per match.

## Coin flip for first move

Red moves first per RULES §3, but **which player is red** is decided per-match. The sim broker generates a `coin_flip_seed` (a UUID-derived 64-bit integer) at match-creation time and stores it in `matches.coin_flip_seed`. The broker uses that seed to deterministically pick which of the two players plays red.

This is the **only** entropy in chonkers. After this single sample, the rest of the match is a deterministic function of (engine rules, AI profiles, recorded moves). Replaying the match — for outlier debugging during the rc 10,000-run pass, or for a post-match replay UI — re-derives the same colour assignment from the same seed and produces the same game.

The seed is generated by the platform's `crypto.getRandomValues()` at match-creation time only. **`crypto.getRandomValues` is not banned in the broker** — only in the engine, AI, sim core, and store. The broker is the legitimate entropy source for one-shot match initialisation.

## What lives in code, not the database

The 9 profile keys + their weight tables + their search depths + their forfeit thresholds are **TypeScript constants** in `src/ai/profiles.ts`. They are not database rows. Reasons:

- The values change via balance-tune commits during alpha/beta/rc; tracked as conventional-commit `feat(ai): tune balanced-medium forfeit threshold` edits with reviewable diffs.
- `matches.red_profile` and `matches.white_profile` are foreign references *to* code constants — validated at insert time by `src/store/repos/matchesRepo.ts`, which only accepts profile keys that exist in `src/ai/profiles.ts` (or the literal `'human'`).
- A schema migration is the wrong mechanism for "change a number from 2.0 to 2.1." A code commit is the right one.

If user-defined profiles ever ship (let users tune their own AIs), that's a schema migration at *that* point — adding a `user_profiles` table — and `matches.{red,white}_profile` becomes a union of "built-in profile key" and "FK to user_profiles.id". That's a future-far concern.

## Tuning history

The tables above are the **alpha-stage initial weights**. As balance data lands from the 100/1000/10000 runs, this section records each tune.

### alpha-stage initial (current)

Authored 2026-04-29 from theoretical reasoning over the chonkers feature set. No empirical data yet. These values are committed to make alpha possible; the alpha 100-run pass is where empirical tuning begins.

### (next entries appended on each balance tune)

Each entry records:

- The run cycle that fed the tune (alpha 100-run, beta 1000-run, rc 10000-run, or an interim ad-hoc tune)
- Which weights / depths / thresholds changed and by how much
- The balance signal that motivated the change (e.g. "aggressive-hard won 73% vs defensive-hard at alpha — too high; reduced `chonk_opportunities` weight from +1.5 to +1.1")
- The `matches`-sample signature (number of matches counted, span of `started_at` values) for reproducibility

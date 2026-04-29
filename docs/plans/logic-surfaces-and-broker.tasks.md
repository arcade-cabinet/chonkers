# Batch: chonkers-logic-surfaces-and-broker

**Created:** 2026-04-29
**Config:** stop_on_failure=true, auto_commit=true, reviewer_dispatch=parallel-background-per-commit
**PRD:** [logic-surfaces-and-broker.prq.md](./logic-surfaces-and-broker.prq.md)

## Tasks

1.  [P1] **Author CLAUDE.md** — Per-repo agentic config with profile includes (arcade-game + mobile-android + standard-repo); marker `<!-- profile: arcade-game + mobile-android + standard-repo v1 -->`; verified run/test/build commands.
    - Files: CLAUDE.md
    - Criteria: marker present; profile includes resolve; commands verified executable

2.  [P1] **Author AGENTS.md** — Codex-targeted protocols extending CLAUDE.md; autonomy doctrine; reviewer dispatch policy.
    - Files: AGENTS.md
    - Criteria: file exists with frontmatter; explicit autonomy + commit + review rules

3.  [P1] **Author STANDARDS.md** — Non-negotiable rules with `Why:` and `How to apply:` per rule.
    - Files: STANDARDS.md
    - Criteria: file exists with frontmatter; ≥10 explicit rules each with `Why:`+`How to apply:`

4.  [P1] **Rewrite README.md** — Tagline, status pointer, verified quick-start, tech stack, project layout, doc-pillar links.
    - Files: README.md
    - Criteria: tagline "Stack. Don't capture." present; quick-start commands all execute; layout matches src/+app/

5.  [P1] **Revise docs/RULES.md** — Coin-flip first-mover via crypto.getRandomValues; multi-run split partition examples; chain abort rule; win-check timing; 3D occupancy state.
    - Files: docs/RULES.md
    - Criteria: §3 documents coin-flip; §5 has worked examples for {0,1,4} and {0,2,5}; §7 documents win-check timing

6.  [P1] **Author docs/AI.md** — Decide signature; AiOptions; difficulty knobs; disposition bundles; DecisionTrace; determinism contract; profile catalog; alpha-beta over Yuka Graph.
    - Files: docs/AI.md
    - Criteria: 9 profiles enumerated; full DecisionTrace structure documented; determinism stated as test spec

7.  [P1] **Author docs/SIM.md** — World structure (Game/Match singletons; per-piece entities); trait inventory; action surface; broker invariants.
    - Files: docs/SIM.md
    - Criteria: all traits documented; all actions documented with pre/post; invariants stated as test specs

8.  [P1] **Author docs/PROPERTIES.md** — Falsifiable propositions over deterministic AI matches.
    - Files: docs/PROPERTIES.md
    - Criteria: termination/balance/soundness/engagement/determinism propositions each tagged with test file

9.  [P1] **Revise docs/ARCHITECTURE.md** — Final layout (engine/ai/persistence/sim + app/); dependency arrow; Yuka usage scope; localStorage circuit-breaker; no PRNG.
    - Files: docs/ARCHITECTURE.md
    - Criteria: module boundaries match final structure; dependency arrows documented; Yuka subset stated

10. [P1] **Revise docs/STATE.md** — Reflect post-PRD state.
    - Files: docs/STATE.md
    - Criteria: "What's done" and "What's NOT done" reflect engine/ai/sim/persistence + docs landed; visual wiring is next

11. [P1] **Revise docs/TESTING.md** — Tier-1 property tests + 100-game broker; tier-2/3/4 are next-milestone.
    - Files: docs/TESTING.md
    - Criteria: tier-1 lists all test files we'll create; broker described as integration assertion

12. [P1] **Reconcile DESIGN.md and LORE.md** — Light review; correct any drift from architectural decisions.
    - Files: docs/DESIGN.md, docs/LORE.md
    - Criteria: tokens table matches src/design/tokens.ts after task 14 lands; voice guide aligns with future surface UI

13. [P1] **Apply src/ vs app/ split** — Move existing files; update vite/vitest/biome/tsconfig; drop tests/ dir.
    - Files: filesystem moves; tsconfig.json; vite.config.ts; vitest.config.ts; biome.json; package.json
    - Criteria: `find src -name '*.tsx'` empty; `pnpm typecheck && pnpm lint && pnpm build` clean; `tests/` gone

14. [P2] **Write src/engine/__tests__/positions.test.ts** — fast-check property tests for position math.
    - Files: src/engine/__tests__/positions.test.ts
    - Criteria: ≥10 properties; ≥100 iterations each; imports from @/engine; fails before impl

15. [P2] **Write src/engine/__tests__/slices.test.ts** — partitionRuns property tests + worked examples from RULES.md.
    - Files: src/engine/__tests__/slices.test.ts
    - Criteria: ≥6 properties; explicit {0,1,4}→[[0,1],[4]] and {0,2,5}→[[0,2],[5]] cases; rejects empty + full subsets

16. [P2] **Write src/engine/__tests__/initialState.test.ts** — 5-4-3 layout asserts; both first-player options.
    - Files: src/engine/__tests__/initialState.test.ts
    - Criteria: 12 reds + 12 whites; rows 0/5/10 empty; firstPlayer honored

17. [P2] **Implement src/engine/types.ts** — Color/Cell/Piece(col,row,h,color)/Stack(materialized)/Board(Map<bigint,Piece>)/Run/Action(unified)/SplitChain/GameState/MatchState.
    - Files: src/engine/types.ts
    - Criteria: all types exported; Action is `{from, runs:[{indices,to}]}`; Board is Map; materializeStack helper exported

18. [P2] **Implement src/engine/positions.ts** — posToVector3 (Yuka), vector3ToPos, cellsEqual, chebyshevDistance, isOnBoard.
    - Files: src/engine/positions.ts
    - Criteria: task 14 tests pass; uses Yuka Vector3; constants exported

19. [P2] **Implement src/engine/slices.ts** — partitionRuns(selectedIndices, stackHeight) → Run[].
    - Files: src/engine/slices.ts
    - Criteria: task 15 tests pass

20. [P2] **Implement src/engine/initialState.ts** — createInitialState({firstPlayer}).
    - Files: src/engine/initialState.ts
    - Criteria: task 16 tests pass

21. [P2] **Write src/engine/__tests__/environment.test.ts** — stepAction property tests + worked examples covering move/chonk/split/chain.
    - Files: src/engine/__tests__/environment.test.ts
    - Criteria: ≥8 properties; ≥200 fast-check iterations; explicit cases for every Action shape

22. [P2] **Write src/engine/__tests__/env-query.test.ts** — isLegalAction round-trip; enumerateLegalActions soundness; isGameOver.
    - Files: src/engine/__tests__/env-query.test.ts
    - Criteria: ≥6 properties; ≥500-state round-trip soundness asserted

23. [P2] **Write src/engine/__tests__/win-check.test.ts** — Empty-board non-terminal; constructed end-game; reflection symmetry.
    - Files: src/engine/__tests__/win-check.test.ts
    - Criteria: ≥5 properties incl. reflection symmetry

24. [P2] **Write src/engine/__tests__/splitChain.test.ts** — Queued runs apply in order; abort on illegal destination; clear when last resolves.
    - Files: src/engine/__tests__/splitChain.test.ts
    - Criteria: ≥5 properties; explicit chain-with-intervention test; explicit chain-abort test

25. [P2] **Implement src/engine/environment.ts** — stepAction (pure transition).
    - Files: src/engine/environment.ts
    - Criteria: task 21 tests pass

26. [P2] **Implement src/engine/env-query.ts** — isLegalAction, enumerateLegalActions, enumerateLegalRuns, isGameOver.
    - Files: src/engine/env-query.ts
    - Criteria: task 22 tests pass; deterministic enumeration order

27. [P2] **Implement src/engine/win-check.ts** — isWin, isWinFor.
    - Files: src/engine/win-check.ts
    - Criteria: task 23 tests pass

28. [P2] **Implement src/engine/splitChain.ts** — applyChainStep state machine.
    - Files: src/engine/splitChain.ts
    - Criteria: task 24 tests pass

29. [P2] **Implement src/engine/game.ts** — createMatch, runTurn.
    - Files: src/engine/game.ts
    - Criteria: all engine tests pass

30. [P2] **Author src/engine/index.ts barrel** — Public API matching docs/RULES.md surface.
    - Files: src/engine/index.ts
    - Criteria: every test imports resolve; pnpm typecheck clean; surface matches docs/RULES.md exactly

31. [P3] **Write src/ai/__tests__/zobrist.test.ts** — Hash determinism + collision test (≥1M states, 0 collisions) + chain-state inclusion.
    - Files: src/ai/__tests__/zobrist.test.ts
    - Criteria: imports from @/ai; uses real engine; collision count = 0; identical states hash identically

32. [P3] **Write src/ai/__tests__/perception.test.ts** — Radius 1/2/3 correctness; mobility breakdown; multi-run split aggregation.
    - Files: src/ai/__tests__/perception.test.ts
    - Criteria: all three radii asserted; mobility asserted on canonical positions; uses real engine

33. [P3] **Write src/ai/__tests__/disposition.test.ts** — Three disposition bundles compared on canonical positions; memory modulation.
    - Files: src/ai/__tests__/disposition.test.ts
    - Criteria: ≥3 axes × 3 dispositions; memory modulation across ≥3 scenarios

34. [P3] **Write src/ai/__tests__/scoreNode.test.ts** — Monotonicity in dominant-tops-on-opp-home; vulnerability/advancement direction.
    - Files: src/ai/__tests__/scoreNode.test.ts
    - Criteria: ≥5 monotonicity asserts

35. [P3] **Implement src/ai/zobrist.ts** — 64-bit BigInt keys deterministic at module init; chain state in hash; NO Math.random.
    - Files: src/ai/zobrist.ts
    - Criteria: task 31 tests pass; no Math.random

36. [P3] **Implement src/ai/perception.ts** — perceive(state, action, radius) → Percept with mobility.
    - Files: src/ai/perception.ts
    - Criteria: task 32 tests pass

37. [P3] **Implement src/ai/memoryFeatures.ts** — extractMemoryFeatures from HistoryGraph.
    - Files: src/ai/memoryFeatures.ts
    - Criteria: consumed correctly by tasks 33+38 tests

38. [P3] **Implement src/ai/disposition.ts** — Three weight bundles + effectiveWeights memory modulation.
    - Files: src/ai/disposition.ts
    - Criteria: task 33 tests pass

39. [P3] **Implement src/ai/scoreNode.ts** — scoreNode(percept, memoryFeatures, disposition).
    - Files: src/ai/scoreNode.ts
    - Criteria: task 34 tests pass

40. [P3] **Write src/ai/__tests__/HistoryGraph.test.ts** + **LookaheadGraph.test.ts** — Graph wrappers around Yuka Graph; transposition; minimax weight propagation.
    - Files: src/ai/__tests__/HistoryGraph.test.ts; src/ai/__tests__/LookaheadGraph.test.ts
    - Criteria: ≥4 properties each; transposition reuses nodes; minimax values correct on hand-constructed terminals

41. [P3] **Implement src/ai/HistoryGraph.ts** — Linear chain of states-via-actions; appendMove; lookback.
    - Files: src/ai/HistoryGraph.ts
    - Criteria: task 40 (HistoryGraph) tests pass; uses Yuka Graph

42. [P3] **Implement src/ai/LookaheadGraph.ts** — Per-turn build; recursive expansion to depth limit; transposition via Zobrist; minimax propagation.
    - Files: src/ai/LookaheadGraph.ts
    - Criteria: task 40 (LookaheadGraph) tests pass; uses Yuka Graph

43. [P3] **Implement src/ai/search.ts** — alphaBetaMinimax depth-limited with pruning; lexicographic tiebreaking.
    - Files: src/ai/search.ts
    - Criteria: feeds correct values to LookaheadGraph

44. [P3] **Implement src/ai/profiles.ts** — 9 profiles = 3 difficulties × 3 dispositions.
    - Files: src/ai/profiles.ts
    - Criteria: all 9 profiles enumerated and exported

45. [P3] **Write src/ai/__tests__/decide.test.ts** — Legality (1k states); determinism (5×100 byte-equal); strength (depth-3 beats depth-1 ≥70%); variation (1k states distinct decisions); trace replay.
    - Files: src/ai/__tests__/decide.test.ts
    - Criteria: imports from @/ai; uses real engine; all five assertions pass

46. [P3] **Implement src/ai/decide.ts** — Public entry composing LookaheadGraph + search + profiles + trace emission.
    - Files: src/ai/decide.ts
    - Criteria: task 45 tests pass

47. [P3] **Author src/ai/index.ts barrel** — Public AI API matching docs/AI.md.
    - Files: src/ai/index.ts
    - Criteria: every D-test imports resolve; surface matches docs/AI.md exactly

48. [P4] **Write src/persistence/__tests__/persistence.test.ts** + **_localStorageShim.ts** — Settings round-trip, match insert/finalize, move append/get, listMatches limits, reset cleans namespace.
    - Files: src/persistence/__tests__/persistence.test.ts; src/persistence/__tests__/_localStorageShim.ts
    - Criteria: ≥10 properties; polyfilled shim used in node tier; tests use real createPersistence

49. [P4] **Implement src/persistence/types.ts** — Persistence interface, Settings, MatchRecord, MoveRecord, DEFAULT_SETTINGS.
    - Files: src/persistence/types.ts
    - Criteria: type-imports from @/engine and @/ai; all types exported

50. [P4] **Implement src/persistence/localStorage.ts** — createLocalStoragePersistence; chonkers.* namespace; reset() clears namespace.
    - Files: src/persistence/localStorage.ts
    - Criteria: task 48 tests pass; all keys namespaced

51. [P4] **Implement src/persistence/sqlite.ts stub** — Throws "not yet implemented" with clear pointer to localStorage in dev/test.
    - Files: src/persistence/sqlite.ts
    - Criteria: matches Persistence interface signature; throws on every method

52. [P4] **Implement src/persistence/factory.ts** — createPersistence() selects localStorage in dev/test, sqlite in production; module-level singleton.
    - Files: src/persistence/factory.ts
    - Criteria: NODE_ENV gated; same instance per process

53. [P4] **Author src/persistence/index.ts barrel** — Exports createPersistence, DEFAULT_SETTINGS, types.
    - Files: src/persistence/index.ts
    - Criteria: task 48 tests imports resolve

54. [P5] **Write src/sim/__tests__/world.test.ts** — World bootstrap; Game + Match singletons spawned; defaults from persistence.
    - Files: src/sim/__tests__/world.test.ts
    - Criteria: imports from @/sim; uses real persistence; singletons queryable

55. [P5] **Write src/sim/__tests__/syncEngineToBoard.test.ts** — Spawn/despawn/update reconciler; idempotency.
    - Files: src/sim/__tests__/syncEngineToBoard.test.ts
    - Criteria: spawn/despawn/update asserted; idempotent under no-op

56. [P5] **Write src/sim/__tests__/actions.test.ts** — Each action tested independently with real engine + ai + persistence; no mocks.
    - Files: src/sim/__tests__/actions.test.ts
    - Criteria: every action in docs/SIM.md tested; world consistency invariant asserted; reset between cases

57. [P5] **Implement src/sim/world.ts** — createSimWorld() bootstrapping Game + Match singletons.
    - Files: src/sim/world.ts
    - Criteria: task 54 tests pass

58. [P5] **Implement src/sim/traits/** — Per-domain trait files + index barrel.
    - Files: src/sim/traits/{piece,animation,match,ui,screen,index}.ts
    - Criteria: all traits exported via traits/index.ts; tasks 54-56 reference traits successfully

59. [P5] **Implement src/sim/systems/syncEngineToBoard.ts** — Diff-based reconciler.
    - Files: src/sim/systems/syncEngineToBoard.ts; src/sim/systems/index.ts
    - Criteria: task 55 tests pass

60. [P5] **Implement src/sim/actions.ts** — Full action surface via createActions; each action wires engine + ai + persistence.
    - Files: src/sim/actions.ts
    - Criteria: task 56 tests pass; every action documented in docs/SIM.md is implemented

61. [P5] **Author src/sim/index.ts barrel** — Public sim API matching docs/SIM.md.
    - Files: src/sim/index.ts
    - Criteria: F-test imports resolve; surface matches docs/SIM.md exactly

62. [P5] **Write src/sim/__tests__/100-games.test.ts — THE BROKER ACCEPTANCE TEST** — ≥100 full matches via sim/actions.ts; spans 81-pairing matrix; aggregate propositions assert; 5-seed determinism replay.
    - Files: src/sim/__tests__/100-games.test.ts
    - Criteria: ≥100 matches; every match terminates with winner; aggregate PROPERTIES.md propositions assert; determinism replay byte-equal; runtime <5min on CI; **THIS IS THE PRD ACCEPTANCE TEST**

63. [P6] **Update package.json deps** — Add koota, howler, @types/howler. Confirm yuka stays. Confirm no seedrandom/multimcts/zustand.
    - Files: package.json, pnpm-lock.yaml
    - Criteria: pnpm install clean; pnpm typecheck clean

64. [P6] **Author .claude/gates.json** — Coverage rules for src/{engine,ai,persistence,sim}/**; ban Math.random in src/; cross-package import bans; Yuka MathUtils/NavMesh/Wander/steering bans.
    - Files: .claude/gates.json
    - Criteria: file exists; manual verification: synthetic violation triggers ban

65. [P6] **Update .agent-state/directive.md** — Reflect this PRD's deliverables done; visual wiring queued for next milestone.
    - Files: .agent-state/directive.md
    - Criteria: Status: RELEASED; "what's done" current; "queue" enumerates next-milestone items

66. [P6] **Final verification** — pnpm install && pnpm typecheck && pnpm lint && pnpm test:node && pnpm build all clean from a fresh checkout.
    - Files: none
    - Criteria: every command exits 0; broker test passes; commit pushed to origin/main; release-please opens release PR

## Execution Order

Strict dependency order enforced. Each group completes (test + impl + barrel) before the next group begins:

```text
Group A docs (1-12) — first wave; documentation drives subsequent code
  ↓
Group B layout (13) — repo structure aligned
  ↓
Group C engine (14-30) — TDD: tests then impl, primitive types first
  ↓
Group D ai (31-47) — TDD: tests against REAL engine, no mocks
  ↓
Group E persistence (48-53) — TDD: localStorage circuit-breaker
  ↓
Group F sim (54-62) — TDD: tests against REAL engine + ai + persistence
  Final task: 100-games broker acceptance test
  ↓
Group G health (63-66) — gates, directive, final verification
```

Within each TDD group, every test file (red bar) must exist and fail before its corresponding implementation begins. Every barrel test must pass before the next group begins.

## Configuration

```yaml
batch_name: chonkers-logic-surfaces-and-broker
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1
```

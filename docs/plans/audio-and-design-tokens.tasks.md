# Batch: chonkers-audio-and-design

**Created:** 2026-04-29
**PRD:** [audio-and-design-tokens.prq.md](./audio-and-design-tokens.prq.md)
**Prerequisite:** persistence.prq.md merged

## Tasks

1. [P1] **Update docs/DESIGN.md** — Reconcile tokens table, motion variant references, audio role table.
2. [P1] **Author src/audio/README.md** — Quick-start + role table.
3. [P1] **Author src/design/README.md** — Tokens / theme / motion at a glance.
4. [P2] **Install Howler** — `pnpm add howler @types/howler`.
5. [P3] **Author src/audio/__tests__/_setup.ts** — Browser-tier setup, bus singleton reset, kv settings clear.
6. [P3] **Write src/audio/__tests__/audioBus.test.ts** — Init preloads, play triggers, setVolume clamps + persists, setMuted stops + persists, idempotent.
7. [P3] **Write src/audio/__tests__/ducking.test.ts** — Sting ducks ambient ~25% in 200ms, restores in 400ms, no over-quieting.
8. [P3] **Write src/audio/__tests__/volume-from-kv.test.ts** — Init reads kv volume + muted with defaults, round-trip.
9. [P4] **Implement src/audio/roles.ts + audioBus.ts** — Lazy singleton, six-clip preload, kv persistence.
10. [P4] **Implement src/audio/ducking.ts** — duckAmbient + restoreAmbient with fade.
11. [P4] **Author src/audio/index.ts barrel** — getAudioBus, createAudioBus, types.
12. [P4] **Update src/design/tokens.ts** — Add splitRadial + turnBadge sub-trees.
13. [P4] **Author src/design/theme.ts** — Radix theme config.
14. [P4] **Author src/design/motion.ts** — Variant library + reducedMotionFallback.
15. [P4] **Update src/design/index.ts barrel** — Re-exports.
16. [P5] **Run test suite** — `pnpm test:browser src/audio` green, typecheck clean, ≤20s.
17. [P5] **Cross-package check** — Audio imports only @/persistence + howler; design imports only framer-motion + @radix-ui/themes types.

## Configuration

```yaml
batch_name: chonkers-audio-and-design
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1
```

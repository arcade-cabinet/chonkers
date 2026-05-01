---
title: src/audio
updated: 2026-04-30
status: current
domain: audio
---

# src/audio

Howler-backed audio bus for Chonkers. Pure I/O wrapper — no procedural audio, just role-keyed playback of seven committed clips with ducking + kv-backed volume + mute.

## Quick start

```ts
import { getAudioBus } from "@/audio";

// Anywhere a sound needs to fire:
const audio = await getAudioBus();
audio.play("chonk");

// Game-start:
audio.startAmbient();

// Game-over:
audio.play("sting"); // ducks ambient
audio.play("win");   // ducks ambient again; stays ducked until both end
```

`getAudioBus()` is an async lazy singleton. The first call initialises (kv read + Howl preload); every subsequent call returns the same resolved promise. Concurrent first-callers converge on the same in-flight promise — no double-init.

## Roles

| Role | File | Loop | Ducks ambient |
|------|------|------|---------------|
| `ambient` | `public/assets/audio/ambient/bg_loop.wav` | yes | n/a (the duck target) |
| `move` | `effects/move.ogg` | no | no |
| `chonk` | `effects/chonk.ogg` | no | no |
| `split` | `effects/split.ogg` | no | no |
| `sting` | `effects/game_over_sting.ogg` | no | yes |
| `win` | `voices/you_win.ogg` | no | yes |
| `lose` | `voices/you_lose.ogg` | no | yes |

See `docs/DESIGN.md` "Audio" section for the role-trigger contract and ducking rationale.

## Persistence

Volume + mute are persisted to `kv` namespace `'settings'`:

| Key | Type | Default |
|-----|------|---------|
| `volume` | number 0..1 | `0.7` |
| `muted` | boolean | `false` |

`bus.setVolume(v)` clamps to [0, 1] and writes to kv. `bus.setMuted(m)` writes to kv and stops in-flight playback when muting.

## Public surface

```ts
interface AudioBus {
  play(role: AudioRole): void;
  stop(role: AudioRole): void;
  startAmbient(): void;
  stopAmbient(): void;
  isPlaying(role: AudioRole): boolean;
  has(role: AudioRole): boolean;
  getVolume(): number;
  getMuted(): boolean;
  setVolume(v: number): Promise<void>;
  setMuted(m: boolean): Promise<void>;
  // Internal-state introspection (used by tests + diagnostics):
  getActiveDucks(): number;
  getAmbientRequested(): boolean;
}
```

## Import boundary

Per `CLAUDE.md`, this package imports `@/persistence/preferences` (for kv), `@/utils/assetUrl` (for the Vite-resolved clip URLs), and `howler`. It does NOT import from `@/engine`, `@/ai`, `@/sim`, or `@/scene`.

## Tests

Tier 2 (browser) under `src/audio/__tests__/*.browser.test.ts`. Use real Howler + real kv via `@capacitor/preferences` web fallback. Vitest's playwright provider is configured with `--autoplay-policy=no-user-gesture-required` so audio playback isn't blocked in headless runs.

# PRD: src/audio — Howler bus + design token reconciliation

**Created:** 2026-04-29
**Status:** ACTIVE
**Owner:** jbogaty
**Acceptance:** A typed audio bus over Howler exposing role-keyed playback, reading volume + mute settings from `kv` (Capacitor Preferences). All seven committed clips wired with role-correct triggering. `src/design/` tokens, Radix Theme config, and framer-motion variant library reconciled with the visual shell's needs.

**Prerequisite:** [persistence-and-db.prq.md](./persistence-and-db.prq.md) merged. `kv` is the only persistence touchpoint here.

---

## Why this is its own PRD

Audio + design tokens are leaf packages — they have no dependency on engine, ai, store, sim, or any game logic. They're:

- **Pure I/O wrappers** (audio over Howler; no procedural audio, just playback of committed files).
- **Pure constants** (design tokens, Radix theme config, motion variants).

Both are consumed by the visual shell (`app/`) but not by anything in `src/` except via `kv` for the audio bus reading volume settings. Factoring them as their own PRD means they can land independently of the visual shell, and the visual shell PRD has fewer concerns.

A nice side effect: this PRD is small enough to ship in a day or two, providing an early reviewable slice that exercises the PR workflow before the larger logic PRDs touch real code.

---

## Goal

Land:

1. **`src/audio/`** — Howler-backed audio bus. Seven clips: `ambient`, `move`, `chonk`, `split`, `sting`, `win`, `lose`. Role-keyed dispatch (`audio.play('chonk')`). Reads volume + mute from `kv` namespace `'settings'` keys `'volume'` (number 0..1) and `'muted'` (boolean). Ducking helper that lowers ambient under sting + voice. Loop control for ambient. Tested in browser tier with real Howler instances.

2. **`src/design/tokens.ts` reconciliation** — verify the existing tokens file (`wood.boardMain`, `wood.boardHome`, `wood.pieceRed`, `wood.pieceWhite`, `ink.*`, `accent.*`, `surface.*`, `font.*`, `motion.*`, `board.*`) covers everything the visual shell will reference. Add tokens for `app/components/SplitRadial.tsx` slice states (idle / hovered / selected / hold-ready / committed) and for `app/components/TurnBadge.tsx` colour banding. Document each token's consumer.

3. **`src/design/theme.ts`** — Radix Themes config: `appearance: 'dark'`, `accentColor: 'amber'` (matches `accent.select`), `grayColor: 'sand'` (warm to read against wood), `radius: 'medium'`, `panelBackground: 'translucent'`. Single config object exported for `<Theme {...radixTheme}>` wrapping.

4. **`src/design/motion.ts`** — framer-motion variant library: `radialOpen` (160ms ease-out), `radialClose` (140ms ease-in), `sliceSelect` (80ms ease-out), `holdFlash` (240ms ease-in-out, 2 cycles), `modalIn`/`modalOut` (180ms), `screenFade` (200ms cross-fade). Reduced-motion variants that flatten to instant snaps.

---

## Architecture

### Audio bus

```
src/audio/
├── index.ts            # barrel: { audioBus, type AudioRole }
├── audioBus.ts         # ~80 lines: role→Howl map; play/stop/setVolume/setMuted; ducking
├── roles.ts            # role→file path map (matches public/assets/audio/)
├── ducking.ts          # ducks ambient when sting/voice plays; restores afterward
└── __tests__/
    ├── _setup.ts       # browser-tier setup; provides real Howler instance
    ├── audioBus.test.ts
    ├── ducking.test.ts
    └── volume-from-kv.test.ts
```

```ts
// src/audio/roles.ts
export const AUDIO_ROLES = {
  ambient: '/assets/audio/ambient/bg_loop.wav',
  move:    '/assets/audio/effects/move.ogg',
  chonk:   '/assets/audio/effects/chonk.ogg',
  split:   '/assets/audio/effects/split.ogg',
  sting:   '/assets/audio/effects/game_over_sting.ogg',
  win:     '/assets/audio/voices/you_win.ogg',
  lose:    '/assets/audio/voices/you_lose.ogg',
} as const;

export type AudioRole = keyof typeof AUDIO_ROLES;
```

```ts
// src/audio/audioBus.ts (sketch)
import { Howl } from 'howler';
import { kv } from '@/persistence';
import { AUDIO_ROLES, type AudioRole } from './roles';
import { duckAmbient, restoreAmbient } from './ducking';

const STING_ROLES: ReadonlyArray<AudioRole> = ['sting', 'win', 'lose'];

export interface AudioBus {
  play(role: AudioRole): void;
  stop(role: AudioRole): void;
  startAmbient(): void;
  stopAmbient(): void;
  setVolume(v: number): Promise<void>; // persists to kv
  setMuted(m: boolean): Promise<void>;
}

let busPromise: Promise<AudioBus> | null = null;

// Async lazy singleton: getAudioBus() returns Promise<AudioBus> resolving
// AFTER init() (kv read + Howl preload) completes. Callers always await.
// There is no public sync getter — the singleton's invariant is "fully
// initialized when the promise resolves," and that requires async work.
export async function getAudioBus(): Promise<AudioBus> {
  if (!busPromise) {
    busPromise = createAudioBus().then(async (bus) => {
      await bus._init();  // private; not part of the public AudioBus interface
      return bus;
    });
  }
  return busPromise;
}
```

Callers always `const audio = await getAudioBus(); audio.play('chonk');`. There is no path to a partially-initialized bus — if `getAudioBus()`'s promise hasn't resolved, the caller hasn't moved past its `await` yet.

The `play(role)` implementation handles overlapping ducks via a counter (so two stings concurrently keep ambient ducked until BOTH end, not just the first):

```ts
private activeDucks = 0;  // counter on the bus instance

play(role: AudioRole) {
  if (this.muted) return;
  const sound = this.howls.get(role);
  if (!sound) return;
  if (STING_ROLES.includes(role)) {
    this.activeDucks++;
    if (this.activeDucks === 1) duckAmbient(this);  // first duck starts the fade-down
  }
  sound.volume(this.volume);
  sound.play();
  if (STING_ROLES.includes(role)) {
    sound.once('end', () => {
      this.activeDucks--;
      if (this.activeDucks === 0) restoreAmbient(this);  // last duck ends the fade-up
    });
  }
}
```

The counter prevents the "first sting to end restores ambient while another sting still plays" bug. The "stack ducking correctly" requirement in the test plan is asserted by playing two stings simultaneously, ending one, asserting ambient stays ducked, then ending the other, asserting ambient restores.

Volume + mute persist to `kv`:

```ts
async setVolume(v: number) {
  this.volume = clamp(v, 0, 1);
  await kv.put('settings', 'volume', this.volume);
}

async setMuted(m: boolean) {
  this.muted = m;
  await kv.put('settings', 'muted', m);
  if (m) {
    for (const sound of this.howls.values()) sound.stop();
  }
}
```

The internal `_init()` (called once by `getAudioBus()`'s promise) reads from `kv` on boot:

```ts
async _init() {
  const volume = (await kv.get<number>('settings', 'volume')) ?? 0.7;
  const muted = (await kv.get<boolean>('settings', 'muted')) ?? false;
  this.volume = volume;
  this.muted = muted;
  // preload all howls
  for (const role of Object.keys(AUDIO_ROLES) as AudioRole[]) {
    this.howls.set(role, new Howl({ src: [AUDIO_ROLES[role]], preload: true, loop: role === 'ambient' }));
  }
  await Promise.all(
    Array.from(this.howls.values()).map(
      (h) => new Promise<void>((resolve, reject) => {
        if (h.state() === 'loaded') return resolve();
        h.once('load', () => resolve());
        h.once('loaderror', (_id, err) => reject(err));
      })
    )
  );
}
```

The bus is an async lazy singleton — `getAudioBus()` returns `Promise<AudioBus>`. The first call constructs + initializes (kv read + Howl preload); subsequent calls return the same resolved promise. Tests reset via `__resetBusForTest()` (test-only export gated behind `import.meta.env.DEV` or equivalent), which clears `busPromise` so the next `getAudioBus()` reconstructs.

### Ducking

```ts
// src/audio/ducking.ts
const DUCK_FACTOR = 0.25;

export function duckAmbient(bus: AudioBus): void {
  const ambient = bus.howls.get('ambient');
  if (!ambient || !ambient.playing()) return;
  // Fade from CURRENT volume (not bus.volume) — preserves any in-flight fade
  // and prevents an abrupt jump if duck is called while a previous duck/restore
  // hasn't fully completed. Mirrors restoreAmbient's symmetric approach.
  ambient.fade(ambient.volume(), bus.volume * DUCK_FACTOR, 200);
}

export function restoreAmbient(bus: AudioBus): void {
  const ambient = bus.howls.get('ambient');
  if (!ambient) return;
  ambient.fade(ambient.volume(), bus.volume, 400);
}
```

### Design tokens — additions

The existing `src/design/tokens.ts` already covers wood, ink, accent, surface, font, motion-budgets, board. Additions for the visual shell:

```ts
// src/design/tokens.ts (additions)
export const tokens = {
  // ... existing ...
  splitRadial: {
    idleStroke: '#1B1410',         // ink.primary
    idleFill: 'transparent',
    hoveredStroke: '#E8B83A',       // accent.select
    selectedFill: '#E8B83A99',      // accent.select @ 0.6 alpha
    selectedStroke: '#E8B83A',
    holdReadyFill: '#3FB67A',       // accent.split
    holdReadyStroke: '#3FB67A',
    committedOpacity: 0.45,         // de-emphasize after commit-drag begins
  },
  turnBadge: {
    redBg: '#7A3B22',               // wood.pieceRed mid-tone
    redInk: '#F5EBD8',              // ink.inverse
    whiteBg: '#D6BC8A',              // wood.pieceWhite mid-tone
    whiteInk: '#1B1410',             // ink.primary
  },
} as const;
```

Each token file exports `tokens as const` so consumers get full literal-type narrowing. CSS variable mirrors live in `app/css/style.css` (already present).

### Radix Themes config

```ts
// src/design/theme.ts
import type { ThemeProps } from '@radix-ui/themes';

export const radixTheme: ThemeProps = {
  appearance: 'dark',
  accentColor: 'amber',
  grayColor: 'sand',
  radius: 'medium',
  scaling: '100%',
  panelBackground: 'translucent',
};
```

### Motion variants

```ts
// src/design/motion.ts
import type { Variants, Transition } from 'framer-motion';
import { tokens } from './tokens';

const ms = (n: number): number => n / 1000; // framer takes seconds

export const radialOpen: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: ms(tokens.motion.uiOpenMs), ease: 'easeOut' },
  },
};

export const radialClose: Variants = {
  visible: { opacity: 1, scale: 1 },
  hidden: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: ms(140), ease: 'easeIn' },
  },
};

export const sliceSelect: Transition = { duration: 0.08, ease: 'easeOut' };

export const holdFlash: Variants = {
  rest: { fill: tokens.splitRadial.selectedFill },
  flashing: {
    fill: [tokens.splitRadial.holdReadyFill, tokens.splitRadial.selectedFill, tokens.splitRadial.holdReadyFill],
    transition: { duration: ms(tokens.motion.uiFlashMs), repeat: 1, ease: 'easeInOut' },
  },
};

export const modalIn: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: ms(tokens.motion.modalMs), ease: 'easeOut' } },
};

export const modalOut: Variants = {
  visible: { opacity: 1, y: 0 },
  hidden: { opacity: 0, y: 16, transition: { duration: ms(140), ease: 'easeIn' } },
};

export const screenFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: ms(200) } },
};

// Reduced-motion variants flatten to instant snaps
export const reducedMotionFallback: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.001 } },
};
```

The visual shell PRD (PRQ-5) chooses between full + reduced via a `usePrefersReducedMotion` hook reading either CSS media query or the `kv` `settings.reducedMotion` flag.

---

## Documentation

### Update `docs/DESIGN.md`

DESIGN.md already exists. Reconcile to ensure:

- The tokens table matches `src/design/tokens.ts` exactly post-additions.
- The motion section references `src/design/motion.ts` variants by name.
- The audio section enumerates the seven committed clips and their role mapping.

### Update `src/audio/README.md` (new)

Inline package README. Quick-start example: `const audio = await getAudioBus(); audio.play('chonk');`. Cross-link to `docs/DESIGN.md` audio section.

### Update `src/design/README.md` (new)

Inline package README. Tokens / theme / motion documented at a glance.

---

## Tasks

### A. Documentation

#### A1. Update `docs/DESIGN.md`

**Files:** `docs/DESIGN.md`

**Acceptance criteria:**
- Tokens table matches final `src/design/tokens.ts`
- Motion section references the variant library by name
- Audio section enumerates seven clips + role table

#### A2. Author `src/audio/README.md`

**Files:** `src/audio/README.md`

**Acceptance criteria:**
- Frontmatter present
- Quick-start + role table

#### A3. Author `src/design/README.md`

**Files:** `src/design/README.md`

**Acceptance criteria:**
- Frontmatter present
- Token / theme / motion sections

---

### B. Dependencies

#### B1. Install Howler

**Description:** Add `howler` and `@types/howler` to dependencies.

**Files:** `package.json`, `pnpm-lock.yaml`

**Acceptance criteria:**
- Both installed
- `pnpm install` clean

---

### C. Tests written first

#### C1. Author `src/audio/__tests__/_setup.ts`

**Description:** Browser-tier vitest setup. Resets the audioBus singleton between tests via `__resetBusForTest()`. Clears `kv` namespace `'settings'` between tests.

**Files:** `src/audio/__tests__/_setup.ts`

**Acceptance criteria:**
- Setup runs in browser tier
- afterEach resets bus + clears settings

#### C2. Write `src/audio/__tests__/audioBus.test.ts`

**Description:** Tests for the bus. Asserts: `await getAudioBus()` resolves with all seven Howls preloaded; `play(role)` triggers the right Howl; `setVolume` clamps to [0, 1] and persists to `kv`; `setMuted` stops in-flight playback and persists; subsequent `getAudioBus()` calls return the same resolved promise; calling `getAudioBus()` while a previous call is still resolving returns the same promise (no double-init).

**Files:** `src/audio/__tests__/audioBus.test.ts`

**Acceptance criteria:**
- ≥6 distinct assertions
- Uses real Howler (no mocks)
- Test fails before D1 lands

#### C3. Write `src/audio/__tests__/ducking.test.ts`

**Description:** Asserts: when `play('sting')` is called while ambient is playing, ambient volume drops to ~25% within 200ms; when sting ends, ambient restores within 400ms; multiple back-to-back stings stack ducking correctly (no over-quieting).

**Files:** `src/audio/__tests__/ducking.test.ts`

**Acceptance criteria:**
- ≥3 assertions
- Uses real Howler timing (or fast-forwards via vitest's fake timers if Howler supports it; verify which approach works)

#### C4. Write `src/audio/__tests__/volume-from-kv.test.ts`

**Description:** Asserts: on `init()`, the bus reads volume from `kv.get('settings', 'volume')` and applies it; if no value, defaults to 0.7; same for `'muted'` defaulting false; round-trip (set via `setVolume(0.4)` → re-init → reads 0.4).

**Files:** `src/audio/__tests__/volume-from-kv.test.ts`

**Acceptance criteria:**
- ≥4 assertions
- Uses real `kv` from `@/persistence` (browser tier)

---

### D. Implementation

#### D1. Implement `src/audio/roles.ts` and `audioBus.ts`

**Files:** `src/audio/roles.ts`, `src/audio/audioBus.ts`

**Acceptance criteria:**
- C2 + C4 tests pass
- Lazy singleton via `getAudioBus()`
- `__resetBusForTest()` exported (gated test-only)

#### D2. Implement `src/audio/ducking.ts`

**Files:** `src/audio/ducking.ts`

**Acceptance criteria:**
- C3 tests pass

#### D3. Author `src/audio/index.ts` barrel

**Files:** `src/audio/index.ts`

**Acceptance criteria:**
- Exports `getAudioBus`, `createAudioBus`, `type AudioRole`, `type AudioBus`
- All audio test imports resolve

#### D4. Update `src/design/tokens.ts`

**Description:** Add `splitRadial` and `turnBadge` token sub-trees per architecture section.

**Files:** `src/design/tokens.ts`

**Acceptance criteria:**
- Tokens file exports the additions
- All tokens still under one `tokens as const` export

#### D5. Author `src/design/theme.ts`

**Description:** Radix theme config object.

**Files:** `src/design/theme.ts`

**Acceptance criteria:**
- Exports `radixTheme: ThemeProps`
- Type-imported from `@radix-ui/themes`

#### D6. Author `src/design/motion.ts`

**Description:** framer-motion variant library + reduced-motion fallback.

**Files:** `src/design/motion.ts`

**Acceptance criteria:**
- All seven variants exported (`radialOpen`, `radialClose`, `sliceSelect`, `holdFlash`, `modalIn`, `modalOut`, `screenFade`)
- `reducedMotionFallback` exported
- Imports `framer-motion` types

#### D7. Update `src/design/index.ts` barrel

**Description:** Re-exports tokens, radixTheme, motion variants.

**Files:** `src/design/index.ts`

**Acceptance criteria:**
- All design exports available via `import { tokens, radixTheme, ... } from '@/design'`

---

### E. Verification

#### E1. Test suite green

**Files:** none

**Acceptance criteria:**
- `pnpm test:browser src/audio` passes
- `pnpm typecheck` clean (design changes type-check)
- ≤20s combined runtime
- 5 consecutive clean runs

#### E2. Cross-package check

**Description:** Manual check: `src/audio/` imports only `@/persistence` (for kv) + `howler`. `src/design/` imports only `framer-motion` types + `@radix-ui/themes` types. Neither package imports from `@/engine`, `@/ai`, `@/sim`, `@/store`, `@/schema`, or anywhere in `app/`.

**Files:** none

**Acceptance criteria:**
- `grep -r "from '@/" src/audio` shows only `@/persistence`
- `grep -r "from '@/" src/design` shows nothing
- Manual scan confirms isolation

---

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

---

## Execution order

```
A1, A2, A3 (docs in parallel)
   ↓
B1 (deps)
   ↓
C1 (test setup)
   ↓
C2, C3, C4 (test files in parallel after C1)
   ↓
D1 (audioBus + roles after C2 + C4)
D2 (ducking after C3 + D1)
D4, D5, D6 (design files in parallel — independent)
   ↓
D3 (audio barrel)
D7 (design barrel)
   ↓
E1, E2 (verification)
```

---

## Risks

- **Howler autoplay policy.** Some browsers refuse to play audio until first user interaction. Test environment uses Playwright, which doesn't have this restriction by default. Production handling is a `app/boot/` concern documented in PRQ-5; this PRD just makes the bus itself work.
- **Audio file load timing.** The six committed audio files in `public/assets/audio/` are 100KB-few MB. `init()` waits for all to preload. If load fails (network blip in test), `init()` should reject and surface the error rather than hang. Tested explicitly.
- **Reduced-motion in tests.** The `reducedMotionFallback` variant duration is 0.001s — vitest's timer resolution may not test this cleanly. Mitigated by asserting "transition.duration < 0.05" rather than exact equality.

---

## Definition of Done

- All A* documentation tasks merged.
- All B* deps installed.
- All C* tests merged + demonstrated red.
- All D* implementations merged.
- E1 + E2 verifications pass.
- `pnpm typecheck && pnpm lint && pnpm test:browser src/audio && pnpm build` clean.
- `src/audio/` and `src/design/` are leaf packages: no game-logic imports.

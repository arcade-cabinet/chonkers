# PRD: native-shell — Capacitor iOS + Android packaging

**Created:** 2026-04-29
**Status:** ACTIVE
**Owner:** jbogaty
**Acceptance:** chonkers boots on Android (debug APK) and iOS Simulator with the same gameplay as the web build. App icon, splash screen, orientation lock, app-state lifecycle (background/foreground), and Capacitor Haptics integration all work. Maestro smoke flow passes on Android.

**Prerequisite:** [visual-shell.prq.md](./visual-shell.prq.md) merged.

---

## Why this is its own PRD

Native packaging is its own concern with its own toolchain (Gradle, xcodebuild, Maestro), its own platform quirks (iOS auto-pause behavior, Android keyboard handling, splash screen specs per platform), and its own validation surface (does the APK actually launch? does the IPA archive cleanly?). Bundling this into the visual-shell PRD would conflate web-render concerns with native-platform concerns; separating it lets each get focused review.

This PRD also intentionally avoids App Store / Play Store submission — that's a follow-on concern (signing keys, store listings, screenshots, review process) and belongs in its own future PRD.

---

## Goal

Land:

1. **Capacitor sync** wired into the build pipeline. `pnpm cap:sync` produces consistent Android + iOS shells.
2. **App icon** generated from a single SVG source — `assets/icon-source.svg` → all required raster sizes for Android adaptive icon + iOS app icon set via a script (`scripts/generate-icons.ts`).
3. **Splash screen** with the wood-board visual (subdued — a hint of the board, not full game render). Configured per platform via Capacitor's splash plugin.
4. **App-state lifecycle** — Capacitor `App` plugin's `appStateChange` event wired to sim actions (pause sim on background; resume on foreground). On the web build, Page Visibility API translates equivalently.
5. **Haptics integration** — `@capacitor/haptics` integrated into the input pipeline. Specifically, the 3-second arm in `useHoldTimer` fires `Haptics.impact({ style: ImpactStyle.Medium })` on supported platforms; legal-move highlight on selection fires `Haptics.selectionStart()`; chonk lands fire `Haptics.impact({ style: ImpactStyle.Heavy })`.
6. **Orientation lock** to portrait via `@capacitor/screen-orientation`.
7. **Status bar styling** via `@capacitor/status-bar` — translucent dark theme matching the wood board.
8. **Maestro smoke flow** — boot → title → start match → make a move → pause via home button (background) → resume (foreground) → quit. Asserts no crashes, audio resumes correctly, sim state preserved.
9. **CI/CD updates** — `cd.yml` already builds Android debug APK on push to main (per scaffold). Add iOS archive build (unsigned) to `release.yml` and Maestro flow execution to a new `native-smoke.yml` workflow.

---

## Architecture

### Capacitor config

Already exists in repo (`capacitor.config.json`). Update to:

```json
{
  "appId": "com.arcadecabinet.chonkers",
  "appName": "Chonkers",
  "webDir": "dist",
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 1500,
      "launchAutoHide": false,
      "backgroundColor": "#0F0A05",
      "androidSplashResourceName": "splash",
      "androidScaleType": "CENTER_CROP",
      "showSpinner": false,
      "androidSpinnerStyle": "large",
      "iosSpinnerStyle": "small",
      "splashFullScreen": true,
      "splashImmersive": true
    },
    "ScreenOrientation": {
      "default": ["portrait"]
    },
    "StatusBar": {
      "style": "DARK",
      "backgroundColor": "#0F0A05"
    },
    "Haptics": {}
  },
  "android": {
    "backgroundColor": "#0F0A05"
  },
  "ios": {
    "backgroundColor": "#0F0A05"
  }
}
```

### Icon generation

```ts
// scripts/generate-icons.ts
import sharp from 'sharp';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const SOURCE = 'assets/icon-source.svg';
const ANDROID_OUT = 'android/app/src/main/res';
const IOS_OUT = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';

const ANDROID_DENSITIES: ReadonlyArray<{ folder: string; size: number }> = [
  { folder: 'mipmap-mdpi',    size:  48 },
  { folder: 'mipmap-hdpi',    size:  72 },
  { folder: 'mipmap-xhdpi',   size:  96 },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

const IOS_SIZES: ReadonlyArray<{ name: string; size: number }> = [
  { name: 'AppIcon-20@2x.png',    size:  40 },
  { name: 'AppIcon-20@3x.png',    size:  60 },
  { name: 'AppIcon-29@2x.png',    size:  58 },
  { name: 'AppIcon-29@3x.png',    size:  87 },
  { name: 'AppIcon-40@2x.png',    size:  80 },
  { name: 'AppIcon-40@3x.png',    size: 120 },
  { name: 'AppIcon-60@2x.png',    size: 120 },
  { name: 'AppIcon-60@3x.png',    size: 180 },
  { name: 'AppIcon-1024.png',     size: 1024 },
];

// generate Android icons
for (const { folder, size } of ANDROID_DENSITIES) {
  mkdirSync(join(ANDROID_OUT, folder), { recursive: true });
  await sharp(SOURCE)
    .resize(size, size)
    .png()
    .toFile(join(ANDROID_OUT, folder, 'ic_launcher.png'));
}

// generate iOS icons
for (const { name, size } of IOS_SIZES) {
  await sharp(SOURCE)
    .resize(size, size)
    .png()
    .toFile(join(IOS_OUT, name));
}
```

Run via `pnpm icons` (script added to `package.json`). One source file, all platforms updated atomically.

### App-state lifecycle

```ts
// src/scene/index.ts (additions — wires App plugin)
import { App as CapacitorApp } from '@capacitor/app';

await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
  const actions = getActions(world);
  if (isActive) {
    actions.resume();
    getAudioBus().resumeAmbient();
  } else {
    actions.pause();
    getAudioBus().pauseAll();
  }
});

// Web fallback via Page Visibility
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const isActive = document.visibilityState === 'visible';
    const actions = getActions(world);
    if (isActive) {
      actions.resume();
      getAudioBus().resumeAmbient();
    } else {
      actions.pause();
      getAudioBus().pauseAll();
    }
  });
}
```

### Haptics integration

```ts
// src/scene/overlay/splitRadial.ts (additions — fired from the hold-timer callback)
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// inside the timer fire callback:
Haptics.impact({ style: ImpactStyle.Medium }).catch(() => { /* unsupported platform — no-op */ });
```

```ts
// src/scene/pieces.ts (additions for selection)
function onSelectionChanged(selected: boolean): void {
  if (selected) {
    Haptics.selectionStart().catch(() => {});
  }
}
```

The `.catch(() => {})` swallows errors on platforms where Haptics is unsupported (e.g. desktop browsers without Haptics support). This is the standard Capacitor pattern.

### Maestro flow

```yaml
# maestro/smoke.yml
appId: com.arcadecabinet.chonkers
---
- launchApp
- assertVisible: "Chonkers"
- assertVisible: "New game"
- tapOn: "New game"
- assertVisible: "Difficulty"
- tapOn: "Start"
- assertVisible:
    id: "play-view-canvas"
- waitForAnimationToEnd:
    timeout: 5000
- pressHome
- launchApp
- assertVisible:
    id: "play-view-canvas"
- assertVisible: "Resume"
- tapOn: "Resume"
- waitForAnimationToEnd
- back
- assertVisible: "Quit match?"
- tapOn: "Confirm"
- assertVisible: "Chonkers"
```

Run via `pnpm maestro:smoke` (script added). CI runs this in a new `native-smoke.yml` workflow on Android emulator.

---

## Tasks

### A. Documentation

#### A1. Update `docs/DEPLOYMENT.md` (or create if absent)

**Files:** `docs/DEPLOYMENT.md`

**Acceptance criteria:**
- Capacitor sync workflow documented
- Icon regeneration documented
- Per-platform build commands documented
- Maestro flow inventory documented

#### A2. Update `docs/STATE.md`

**Files:** `docs/STATE.md`

**Acceptance criteria:**
- Native shell marked as the next-milestone target
- Post-PRD: native shell complete, app-store submission flagged as separate future PRD

#### A3. Author `maestro/README.md`

**Files:** `maestro/README.md`

**Acceptance criteria:**
- Per-flow description
- Local + CI run instructions

---

### B. Capacitor configuration

#### B1. Update `capacitor.config.json`

**Files:** `capacitor.config.json`

**Acceptance criteria:**
- All five plugin configs (SplashScreen, ScreenOrientation, StatusBar, Haptics, App) present
- iOS + Android background colors set
- ApplicationName "Chonkers" not "chonkers"

#### B2. Install Capacitor plugins

**Files:** `package.json`, `pnpm-lock.yaml`

**Acceptance criteria:**
- `@capacitor/app`, `@capacitor/haptics`, `@capacitor/screen-orientation`, `@capacitor/status-bar` installed
- `@capacitor/splash-screen` already installed; verify
- `pnpm cap:sync` runs cleanly

---

### C. Icon + splash generation

#### C1. Author `assets/icon-source.svg`

**Description:** A single SVG source for the chonkers app icon. Uses the brand palette. Square format, 1024x1024 nominal, vector elements only (no embedded raster).

**Files:** `assets/icon-source.svg`

**Acceptance criteria:**
- File exists; valid SVG
- Renders at 48x48 (mipmap-mdpi) without losing legibility
- Uses `wood.pieceRed` and `wood.pieceWhite` from tokens

#### C2. Author `scripts/generate-icons.ts`

**Files:** `scripts/generate-icons.ts`

**Acceptance criteria:**
- Generates all Android + iOS icon sizes from `assets/icon-source.svg`
- `pnpm icons` script added to `package.json`
- Idempotent (re-running doesn't change output unless source changed)

#### C3. Author `assets/splash-source.svg` + integration

**Description:** Splash screen image — wood-board visual, subdued. SVG → PNG at 2732x2732 (covers all device sizes).

**Files:** `assets/splash-source.svg`, splash assets generated under `android/app/src/main/res/drawable*` and `ios/App/App/Assets.xcassets/Splash.imageset`.

**Acceptance criteria:**
- Splash visible on app launch on both platforms

---

### D. App-state lifecycle + haptics

#### D1. Add app-state hooks to `src/scene/index.ts`

**Files:** `src/scene/index.ts`

**Acceptance criteria:**
- Capacitor App.addListener('appStateChange') wired to sim pause/resume
- Web fallback via document.visibilitychange
- Audio bus pauses ambient on background, resumes on foreground

#### D2. Add haptics to the splitting-radial hold timer

**Files:** `src/scene/overlay/splitRadial.ts`

**Acceptance criteria:**
- Hold-arm at 3000ms fires Haptics.impact medium
- Failure handled gracefully on unsupported platforms

#### D3. Add haptics to selection + chonk events

**Files:** `src/scene/pieces.ts`, `src/scene/animations.ts` (chonk-landing tween onComplete)

**Acceptance criteria:**
- Selection start fires Haptics.selectionStart
- Chonk lands fire Haptics.impact heavy
- All wrapped in `.catch(() => {})` for unsupported platforms

#### D4. Add `pause` and `resume` actions to `src/sim/actions.ts`

**Description:** Already in scope per the logic PRD's F8 task list, but ensure the implementations correctly stop animation tweens on pause and resume them on resume. The koota world's frame loop should be paused (no system runs) while paused.

**Files:** `src/sim/actions.ts` (forward-amend if logic PRD didn't complete this aspect)

**Acceptance criteria:**
- `pause()` halts the frame loop + animation tweens
- `resume()` restarts them
- Sim state (engine GameState) is unaffected by pause/resume — game can continue exactly where it was

---

### E. Maestro flows

#### E1. Author `maestro/smoke.yml`

**Files:** `maestro/smoke.yml`

**Acceptance criteria:**
- Full smoke flow per architecture sketch
- Asserts `play-view-canvas` data-testid is present after starting a match
- Background/foreground cycle works
- Quit returns to title

#### E2. Add `pnpm maestro:smoke` script

**Files:** `package.json`

**Acceptance criteria:**
- Script runs maestro against the smoke flow
- Documented in `maestro/README.md`

#### E3. Author `.github/workflows/native-smoke.yml`

**Description:** GitHub Actions workflow running Maestro against an Android emulator on every push to main. Uploads screenshots + videos on failure.

**Files:** `.github/workflows/native-smoke.yml`

**Acceptance criteria:**
- Workflow runs on push to main
- Failure uploads diagnostic artifacts
- Passes consistently on first 5 consecutive runs

---

### F. Verification

#### F1. Android debug APK boots and plays

**Files:** none — process step

**Acceptance criteria:**
- `pnpm native:android:debug` produces a working APK
- APK installed on emulator boots, shows splash, transitions to title, full match playable
- Maestro smoke flow passes locally

#### F2. iOS Simulator boots and plays

**Files:** none — process step

**Acceptance criteria:**
- `pnpm native:ios:build` produces a working build
- Build installed in iOS Simulator boots, shows splash, transitions to title, full match playable
- iOS-specific quirks (safe areas, notch handling) verified

#### F3. App-state lifecycle works on both platforms

**Files:** none

**Acceptance criteria:**
- Background → foreground cycle preserves match state
- Audio resumes (or restarts ambient appropriately)
- No crashes on rapid background/foreground cycling

---

## Configuration

```yaml
batch_name: chonkers-native-shell
config:
  stop_on_failure: true
  auto_commit: true
  reviewer_dispatch: parallel-background-per-commit
  teammates: [coder, reviewer]
  max_parallel_teammates: 1
```

---

## Risks

- **iOS Simulator audio.** iOS Simulator has limited audio support; ambient + sting may not play correctly on simulator even if production iOS hardware works. Verify on a real device before claiming complete.
- **Maestro emulator boot time.** Android emulator on CI is slow; Maestro flow timeout needs tuning. Mitigated by warming the emulator + using a known-good API level (33).
- **Icon source quality.** SVG source must work at 48px minimum; complex iconography won't translate. Constrain to a simple mark — likely just the chonkers logotype "C" or the stack-of-pucks silhouette.
- **App Store submission deferred.** This PRD does NOT cover signing keys, App Store / Play Store submission, screenshots automation, or store listings. Those are post-v1 and require their own PRD.

---

## Definition of Done

- All A* docs merged.
- All B* config + deps merged.
- All C* icon/splash assets generated.
- All D* lifecycle + haptics integrations merged.
- All E* Maestro flows committed + passing in CI.
- F1–F3 verifications pass on real emulator + simulator.
- Maestro smoke green for 5 consecutive nightly runs.
- Repository README "Quick start" updated to include native build commands.

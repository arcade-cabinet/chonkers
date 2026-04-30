/**
 * One-time app initialisation. `app/main.tsx` calls `boot()` once
 * before rendering; the returned `BootResult` is fed into the React
 * tree via context providers.
 *
 * Order matters:
 *   1. Database bootstrap — schema present, migrations replayed,
 *      drizzle handle ready.
 *   2. Audio bus — kv read + Howl preload (bounded).
 *   3. Sim world — koota world wired with `onMatchEnd` →
 *      analytics. This is where `@/analytics` enters the runtime;
 *      `src/sim/*` doesn't import it directly per CLAUDE.md.
 *   4. Capacitor App lifecycle — pause sim on background, resume
 *      on foreground. Web platforms get a Page Visibility API
 *      fallback wired separately in `app/hooks/useAppLifecycle.ts`.
 *
 * Boot failures propagate up to `app/boot/ErrorBoundary.tsx`.
 */

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
	type OrientationLockType,
	ScreenOrientation,
} from "@capacitor/screen-orientation";
import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar";
import { refreshOnMatchEnd } from "@/analytics";
import { type AudioBus, getAudioBus } from "@/audio";
import { bootstrap } from "@/persistence/sqlite";
import {
	buildSimActions,
	createSimWorld,
	Screen,
	type SimActions,
	type SimWorld,
} from "@/sim";

export interface BootResult {
	readonly sim: SimWorld;
	readonly actions: SimActions;
	readonly audio: AudioBus;
	/** Cleanup callback — call on unmount. */
	readonly dispose: () => Promise<void>;
}

/**
 * No-op fallback for the audio bus. Used when the real Howler-backed
 * bus fails to initialise (mobile autoplay, locked AudioContext,
 * CSP block). Silent gameplay is degraded but the game still boots.
 *
 * Method shapes match `AudioBus` exactly so callers don't need to
 * branch.
 */
function createNoopAudioBus(): AudioBus {
	return {
		play: () => {},
		stop: () => {},
		startAmbient: () => {},
		stopAmbient: () => {},
		isPlaying: () => false,
		has: () => false,
		getVolume: () => 0,
		getMuted: () => true,
		setVolume: async () => {},
		setMuted: async () => {},
		getActiveDucks: () => 0,
		getAmbientRequested: () => false,
	};
}

export async function boot(): Promise<BootResult> {
	// 1. Database bootstrap. The bundled `chonkersSQLite.db` from
	//    public/assets/databases/ is imported on first run; subsequent
	//    runs replay any new migrations forward.
	const { db } = await bootstrap();

	// 2. Audio bus — preload all Howls + read kv settings. Bounded
	//    timeouts inside getAudioBus() so a slow Howler load can't
	//    block the entire boot sequence. If the bus init rejects
	//    (mobile autoplay quirk, locked AudioContext, CSP block),
	//    fall back to a no-op bus so the rest of the game still
	//    boots — silent gameplay is degraded but playable.
	let audio: AudioBus;
	try {
		audio = await getAudioBus();
	} catch (err) {
		console.warn("[chonkers/boot] audio init failed, using no-op bus", err);
		audio = createNoopAudioBus();
	}

	// 3. Sim world — koota world + actions. The onMatchEnd callback
	//    wires analytics' `refreshOnMatchEnd` here at the boot
	//    seam (per CLAUDE.md, src/sim cannot import @/analytics).
	const sim = createSimWorld({
		db,
		// Safe-wrap: analytics refresh failures must not propagate
		// into stepTurn/commitHumanAction/forfeit. A failed analytics
		// upsert leaves the matches row finalised, the screen in the
		// terminal state, and the user able to play again — the next
		// onMatchEnd will rescan + recover the divergence.
		onMatchEnd: async (matchId) => {
			try {
				await refreshOnMatchEnd(db, matchId);
			} catch (err) {
				console.warn(
					"[chonkers/boot] refreshOnMatchEnd failed; continuing",
					err,
				);
			}
		},
	});
	const actions = buildSimActions(sim)(sim.world);

	// 4. Native-platform setup: orientation lock + status bar style
	//    + app-lifecycle pause/resume. All gated on
	//    `Capacitor.isNativePlatform()` so the web build is
	//    untouched. Each call is best-effort wrapped — the screen
	//    orientation API can reject on iOS Safari-on-iPad (which
	//    advertises as native to Capacitor in some configurations).
	if (Capacitor.isNativePlatform()) {
		void ScreenOrientation.lock({
			orientation: "portrait" as OrientationLockType,
		}).catch(() => {});
		void StatusBar.setStyle({ style: StatusBarStyle.Dark }).catch(() => {});
	}

	// 5. Capacitor App lifecycle. Native platforms emit
	//    'appStateChange'; web has Page Visibility (handled by a
	//    separate hook). On background, route to the paused screen
	//    iff a match is in progress; on foreground, return to play.
	//    The user can still manually navigate to settings/quit from
	//    the paused screen.
	const lifecycleHandle = Capacitor.isNativePlatform()
		? await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
				if (!sim.handle) return;
				const screenTrait = sim.worldEntity.get(Screen);
				if (!isActive) {
					if (screenTrait?.value === "play") {
						actions.setScreen("paused");
					}
				} else {
					if (screenTrait?.value === "paused") {
						actions.setScreen("play");
					}
				}
			})
		: null;

	const dispose = async (): Promise<void> => {
		if (lifecycleHandle) await lifecycleHandle.remove();
		// Audio + sim live for the lifetime of the app; their
		// cleanup is handled by the page going away.
	};

	// 5. DEV-only test hook. Exposes `window.__chonkers` to
	//    Playwright governor specs (PRQ-5) when both `import.meta.env.DEV`
	//    is true AND the URL carries `?testHook=1`. Production
	//    builds strip the entire branch via Vite's dead-code
	//    elimination — `import.meta.env.DEV` is statically `false`
	//    in production, so the if-block is unreachable + removed.
	if (
		import.meta.env.DEV &&
		typeof location !== "undefined" &&
		new URLSearchParams(location.search).has("testHook")
	) {
		// Cast through unknown to assign to window — TypeScript
		// doesn't let us augment the global type from inside the
		// app barrel without a declaration file.
		(window as unknown as { __chonkers: unknown }).__chonkers = {
			actions,
			audio,
			get state() {
				return sim.handle?.game ?? null;
			},
			get matchId() {
				return sim.handle?.matchId ?? null;
			},
			world: sim.world,
		};
	}

	return { sim, actions, audio, dispose };
}

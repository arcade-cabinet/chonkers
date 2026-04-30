/**
 * Howler-backed audio bus.
 *
 * Async lazy singleton: `getAudioBus()` returns `Promise<AudioBus>`
 * resolving once the kv read + Howl preload finish. Callers always
 * await; there is no path to a partially-initialised bus.
 *
 * Responsibilities:
 *   - Preload all seven role Howls on first access.
 *   - Read volume + muted from `kv` namespace `'settings'` on init;
 *     fall back to defaults (0.7 / false) when absent.
 *   - `play(role)` triggers the Howl, applies ducking via a counter
 *     so overlapping sting/voice plays don't over-quiet ambient.
 *   - `setVolume` / `setMuted` persist back to kv.
 *
 * Per CLAUDE.md import boundary: this package imports only
 * `@/persistence/preferences` (for kv) and `howler`.
 */

import { Howl, Howler } from "howler";
import { kv } from "@/persistence/preferences";
import { AUDIO_ROLES, type AudioRole, STING_ROLES } from "./roles";

const DEFAULT_VOLUME = 0.7;
const DEFAULT_MUTED = false;

// Ducking constants. Inlined here because the duck/restore helpers
// are only called from within the bus itself — no separate testable
// surface justifies a `ducking.ts` module.
const DUCK_FACTOR = 0.25;
const DUCK_FADE_MS = 200;
const RESTORE_FADE_MS = 400;

function duckAmbient(ambient: Howl | undefined, busVolume: number): void {
	if (!ambient?.playing()) return;
	// Fade origin is the CURRENT volume (not bus.volume) — preserves
	// any in-flight previous fade and prevents an abrupt jump if duck
	// is called while a prior duck/restore hasn't fully completed.
	ambient.fade(ambient.volume(), busVolume * DUCK_FACTOR, DUCK_FADE_MS);
}

function restoreAmbient(ambient: Howl | undefined, busVolume: number): void {
	if (!ambient) return;
	ambient.fade(ambient.volume(), busVolume, RESTORE_FADE_MS);
}

const SETTINGS_NAMESPACE = "settings";
const VOLUME_KEY = "volume";
const MUTED_KEY = "muted";

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export type { AudioRole };

export interface AudioBus {
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
	/** Internal duck-counter — public so callers + tests can verify
	 *  duck stacking semantics without relying on Howler's `volume()`
	 *  to reflect in-flight fades (the headless test environment
	 *  doesn't actually run Web Audio through to the speaker, so the
	 *  counter is the authoritative source of "should ambient be
	 *  ducked right now?"). */
	getActiveDucks(): number;
	/** Whether a `startAmbient()` has been called without a matching
	 *  `stopAmbient()`. Sim-internal flag, separate from the Howl's
	 *  `.playing()` which is environment-dependent. */
	getAmbientRequested(): boolean;
}

class HowlerAudioBus implements AudioBus {
	private howls: Map<AudioRole, Howl> = new Map();
	private volume = DEFAULT_VOLUME;
	private muted = DEFAULT_MUTED;
	private activeDucks = 0;
	private ambientRequested = false;

	async init(): Promise<void> {
		const persistedVolume = await kv.get<number>(
			SETTINGS_NAMESPACE,
			VOLUME_KEY,
		);
		const persistedMuted = await kv.get<boolean>(SETTINGS_NAMESPACE, MUTED_KEY);
		// `typeof NaN === "number"` is true and `typeof Infinity === "number"`
		// is true — without an explicit `isFinite` check, a tampered
		// localStorage entry of `NaN` or `Infinity` would flow into
		// `Howl.volume(...)` and either be silently dropped (NaN) or
		// throw a RangeError (Infinity). `clamp01` defends the upper /
		// lower bounds even on legitimate-but-out-of-spec persisted
		// values from older clients.
		this.volume =
			typeof persistedVolume === "number" && Number.isFinite(persistedVolume)
				? clamp01(persistedVolume)
				: DEFAULT_VOLUME;
		this.muted =
			typeof persistedMuted === "boolean" ? persistedMuted : DEFAULT_MUTED;

		for (const role of Object.keys(AUDIO_ROLES) as AudioRole[]) {
			this.howls.set(
				role,
				new Howl({
					src: [AUDIO_ROLES[role]],
					preload: true,
					loop: role === "ambient",
					volume: this.volume,
				}),
			);
		}

		// Kick the shared Web Audio context if the platform
		// suspended it pending a user gesture. Bounded await so
		// `resume()` hanging in a headless env can't deadlock init.
		// PRQ-4's app/boot/ wires a real gesture-based unlock for
		// production; under tests we run Chromium with
		// --autoplay-policy=no-user-gesture-required so the resume
		// completes immediately.
		const ctx = Howler.ctx;
		if (ctx && ctx.state === "suspended") {
			await Promise.race([
				ctx.resume().catch(() => {}),
				new Promise<void>((r) => setTimeout(r, 1000)),
			]);
		}

		// Wait for every Howl to finish loading. Per-Howl timeout so
		// a single slow load can't hang the whole bus init forever
		// — preload-isn't-required for the bus to be usable; if the
		// Howl never fires 'load' or 'loaderror' (CSP, autoplay, or
		// browser quirk), `play()` will trigger a load on demand.
		// 3s is a comfortable upper bound for local preload of small
		// Ogg/Wav files, and bounds test setup time.
		const PRELOAD_TIMEOUT_MS = 3000;
		await Promise.all(
			Array.from(this.howls.values()).map(
				(h) =>
					new Promise<void>((resolve) => {
						if (h.state() === "loaded") return resolve();
						let settled = false;
						const done = () => {
							if (settled) return;
							settled = true;
							resolve();
						};
						h.once("load", done);
						h.once("loaderror", done);
						setTimeout(done, PRELOAD_TIMEOUT_MS);
					}),
			),
		);
	}

	has(role: AudioRole): boolean {
		return this.howls.has(role);
	}

	isPlaying(role: AudioRole): boolean {
		return this.howls.get(role)?.playing() ?? false;
	}

	getVolume(): number {
		return this.volume;
	}

	getMuted(): boolean {
		return this.muted;
	}

	getActiveDucks(): number {
		return this.activeDucks;
	}

	getAmbientRequested(): boolean {
		return this.ambientRequested;
	}

	play(role: AudioRole): void {
		if (this.muted) return;
		const sound = this.howls.get(role);
		if (!sound) return;
		// One-shots fire fresh each time; ambient has loop:true so
		// re-calling play() while it's already playing re-triggers.
		// Ducking decisions are made BEFORE the play() call so the
		// fade can run alongside the new clip.
		if (STING_ROLES.includes(role)) {
			this.activeDucks += 1;
			if (this.activeDucks === 1) {
				duckAmbient(this.howls.get("ambient"), this.volume);
			}
			sound.volume(this.volume);
			const id = sound.play();
			sound.once(
				"end",
				() => {
					this.activeDucks = Math.max(0, this.activeDucks - 1);
					if (this.activeDucks === 0) {
						restoreAmbient(this.howls.get("ambient"), this.volume);
					}
				},
				id,
			);
		} else {
			sound.volume(this.volume);
			sound.play();
		}
	}

	stop(role: AudioRole): void {
		const sound = this.howls.get(role);
		if (!sound) return;
		sound.stop();
		// `stop()` cancels the Howler 'end' event, so we drive the
		// duck counter manually here. We DON'T gate on `playing()` —
		// in headless test environments the Howl may report
		// `playing()` as false even right after `play()`, but the
		// counter was incremented by our own `play()` and must be
		// decremented by the matching `stop()` to stay coherent.
		if (STING_ROLES.includes(role) && this.activeDucks > 0) {
			this.activeDucks -= 1;
			if (this.activeDucks === 0) {
				restoreAmbient(this.howls.get("ambient"), this.volume);
			}
		}
	}

	startAmbient(): void {
		if (this.muted) return;
		const ambient = this.howls.get("ambient");
		if (!ambient) return;
		this.ambientRequested = true;
		ambient.volume(this.volume);
		ambient.play();
	}

	stopAmbient(): void {
		this.ambientRequested = false;
		this.howls.get("ambient")?.stop();
	}

	async setVolume(v: number): Promise<void> {
		this.volume = clamp01(v);
		await kv.put(SETTINGS_NAMESPACE, VOLUME_KEY, this.volume);
		// Mirror to every Howl so subsequent plays use the new
		// volume without rebuilding. Only sync if no duck is in
		// flight; ducking will pick up the new volume on its next
		// fade target.
		if (this.activeDucks === 0) {
			for (const sound of this.howls.values()) sound.volume(this.volume);
		}
	}

	async setMuted(m: boolean): Promise<void> {
		this.muted = m;
		await kv.put(SETTINGS_NAMESPACE, MUTED_KEY, m);
		if (m) {
			for (const sound of this.howls.values()) sound.stop();
			this.activeDucks = 0;
		}
	}

	/**
	 * Unload every registered Howl + clear the role map. Callers MUST
	 * be done with the bus before invoking this — playing on an
	 * unloaded Howl is a no-op. Used by `__resetBusForTest` to
	 * release the Howler global registry between tests.
	 */
	__teardown(): void {
		for (const sound of this.howls.values()) sound.unload();
		this.howls.clear();
		this.activeDucks = 0;
		this.ambientRequested = false;
	}
}

let busPromise: Promise<AudioBus> | null = null;

/**
 * Lazy async singleton accessor. First call constructs + initialises
 * (kv read + Howl preload); subsequent calls return the same
 * promise. Concurrent first calls converge on the same in-flight
 * promise — no double-init.
 */
export function getAudioBus(): Promise<AudioBus> {
	if (!busPromise) {
		const bus = new HowlerAudioBus();
		busPromise = bus.init().then(() => bus as AudioBus);
	}
	return busPromise;
}

/**
 * Test-only escape hatch: clear the singleton so the next
 * `getAudioBus()` re-initialises against the current kv state.
 * Production code MUST NOT call this.
 *
 * Calls `__teardown` on the underlying instance, which `unload()`s
 * every Howl. Without that, Howler retains the orphaned Howls in its
 * global `Howler._howls` registry across tests and any pending
 * `'end'` events fire fades on a global audio graph the test no
 * longer owns.
 */
export async function __resetBusForTest(): Promise<void> {
	if (!busPromise) return;
	try {
		const bus = (await busPromise) as AudioBus & { __teardown(): void };
		bus.__teardown();
	} catch {
		// init may have rejected — fine, just clear and move on.
	}
	busPromise = null;
}

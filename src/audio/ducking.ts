/**
 * Ducking helpers — fade ambient down while a sting plays, restore
 * after. Pulled out of audioBus so the counter-based stacking logic
 * has a separate testable surface.
 *
 * The fade origin is the CURRENT volume (not bus.volume) so an
 * in-flight previous fade isn't snapped to its target — preserves
 * smooth transitions when stings overlap.
 */

import type { Howl } from "howler";

const DUCK_FACTOR = 0.25;
const DUCK_FADE_MS = 200;
const RESTORE_FADE_MS = 400;

export function duckAmbient(
	ambient: Howl | undefined,
	busVolume: number,
): void {
	if (!ambient || !ambient.playing()) return;
	ambient.fade(ambient.volume(), busVolume * DUCK_FACTOR, DUCK_FADE_MS);
}

export function restoreAmbient(
	ambient: Howl | undefined,
	busVolume: number,
): void {
	if (!ambient) return;
	ambient.fade(ambient.volume(), busVolume, RESTORE_FADE_MS);
}

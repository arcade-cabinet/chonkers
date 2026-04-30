/**
 * Capacitor Haptics integration.
 *
 * Returns a stable record of haptic functions for the visual shell
 * to fire on key UI events. On the web build (Capacitor.isNativePlatform()
 * returns false), every method is a no-op so the calls are
 * branch-safe across platforms.
 *
 * Per the visual-shell PRD §5:
 *   - selection (cell click) → light selection-start
 *   - hold-arm (3s) → medium impact
 *   - chonk landing → heavy impact
 */

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { useMemo } from "react";

export interface HapticHandle {
	readonly selection: () => void;
	readonly armHold: () => void;
	readonly chonk: () => void;
}

const NOOP_HANDLE: HapticHandle = {
	selection: () => {},
	armHold: () => {},
	chonk: () => {},
};

export function useHaptics(): HapticHandle {
	return useMemo(() => {
		if (!Capacitor.isNativePlatform()) return NOOP_HANDLE;
		return {
			selection: () => {
				void Haptics.selectionStart().catch(() => {});
			},
			armHold: () => {
				void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
			},
			chonk: () => {
				void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
			},
		};
	}, []);
}

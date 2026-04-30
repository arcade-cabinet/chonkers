/**
 * framer-motion variant library for the Chonkers UI.
 *
 * Durations come from `tokens.motion.*` so the entire 2D motion
 * budget lives in one source of truth. framer-motion takes seconds;
 * the helper `ms()` keeps everything in milliseconds at the call
 * site for readability.
 *
 * Reduced-motion path: callers wire `usePrefersReducedMotion`
 * (PRQ-4 visual shell) to swap any of these for
 * `reducedMotionFallback`, which collapses the animation to a
 * near-instant snap. The fallback's 1ms duration is just a token
 * non-zero — framer treats <16ms (one frame) as effectively
 * instant, but exactly 0ms can short-circuit some lifecycle hooks.
 */

import type { Transition, Variants } from "framer-motion";
import { tokens } from "./tokens";

const ms = (n: number): number => n / 1000;

/** Radial split menu opens. */
export const radialOpen: Variants = {
	hidden: { opacity: 0, scale: 0.8 },
	visible: {
		opacity: 1,
		scale: 1,
		transition: { duration: ms(tokens.motion.uiOpenMs), ease: "easeOut" },
	},
};

/** Radial split menu closes (slightly faster than open per UI convention). */
export const radialClose: Variants = {
	visible: { opacity: 1, scale: 1 },
	hidden: {
		opacity: 0,
		scale: 0.8,
		transition: { duration: ms(140), ease: "easeIn" },
	},
};

/** A slice transitions from idle → hovered → selected. */
export const sliceSelect: Transition = { duration: 0.08, ease: "easeOut" };

/** Hold-ready flash on a selected slice (pulses twice before commit). */
export const holdFlash: Variants = {
	rest: { fill: tokens.splitRadial.selectedFill },
	flashing: {
		fill: [
			tokens.splitRadial.holdReadyFill,
			tokens.splitRadial.selectedFill,
			tokens.splitRadial.holdReadyFill,
		],
		transition: {
			duration: ms(tokens.motion.uiFlashMs),
			repeat: 1,
			ease: "easeInOut",
		},
	},
};

/** Modal in (forfeit confirm, settings, game-over screen). */
export const modalIn: Variants = {
	hidden: { opacity: 0, y: 16 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: ms(tokens.motion.modalMs), ease: "easeOut" },
	},
};

/** Modal out. */
export const modalOut: Variants = {
	visible: { opacity: 1, y: 0 },
	hidden: {
		opacity: 0,
		y: 16,
		transition: { duration: ms(140), ease: "easeIn" },
	},
};

/** Cross-fade between top-level screens. */
export const screenFade: Variants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { duration: ms(200) } },
};

/**
 * Reduced-motion drop-in. Substituted by `usePrefersReducedMotion`
 * (PRQ-4) when either the OS-level prefers-reduced-motion media
 * query is true OR `kv.get('settings', 'reducedMotion')` is true.
 */
export const reducedMotionFallback: Variants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { duration: 0.001 } },
};

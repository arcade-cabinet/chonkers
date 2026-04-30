/**
 * gsap tween factories — every motion in the game lives here.
 *
 * One library, one timeline model, one easing vocabulary across
 * three.js meshes, the camera, board-group rotation, and SVG
 * overlay attributes.
 *
 * Reduced-motion gating: each factory checks `prefers-reduced-motion`
 * AND the persisted `kv.get('settings', 'reducedMotion')` flag and
 * collapses to a near-instant variant when set (per docs/DESIGN.md
 * §"Motion": 200ms linear translate for pieces, 0.001s for UI).
 */

import gsap from "gsap";
import type * as THREE from "three";
import { tokens } from "@/design";

let reducedMotionPreference: boolean | null = null;

/**
 * Read once and cache. Returning a static read keeps tween factories
 * synchronous; settings-toggle radials should call
 * `setReducedMotionOverride(value)` after writing to kv so the cache
 * stays in sync without a re-read every frame.
 */
export function reducedMotion(): boolean {
	if (reducedMotionPreference !== null) return reducedMotionPreference;
	if (typeof window === "undefined") return false;
	const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
	reducedMotionPreference = mq.matches;
	return reducedMotionPreference;
}

export function setReducedMotionOverride(value: boolean): void {
	reducedMotionPreference = value;
}

const PIECE_LIFT_S = tokens.motion.pieceLiftMs / 1000;
const PIECE_ARC_S = tokens.motion.pieceArcMs / 1000;
const PIECE_SETTLE_S = tokens.motion.pieceSettleMs / 1000;
const PIECE_TOTAL_S = PIECE_LIFT_S + PIECE_ARC_S + PIECE_SETTLE_S;
const BOARD_TIP_S = tokens.motion.boardTipMs / 1000;
const COIN_SPIN_S = tokens.motion.coinFlipMs / 1000;

export interface PieceMoveOptions {
	readonly mesh: THREE.Object3D;
	readonly toXZ: { x: number; z: number };
	/** Did this move land on a stack (chonk) — adds the scale-pulse on settle. */
	readonly chonk?: boolean;
	/** Resting Y of the puck on the destination (top of the destination stack). */
	readonly destY: number;
	readonly onComplete?: () => void;
}

/**
 * Lift / arc / settle. The puck lifts straight up to a peak height,
 * arcs across to the destination, then drops with a small bounce.
 * On chonk, the last 8% of the timeline pulses the scale to 1.18×
 * and back to underscore the impact.
 */
export function tweenPieceMove(opts: PieceMoveOptions): gsap.core.Timeline {
	const { mesh, toXZ, chonk, destY, onComplete } = opts;

	if (reducedMotion()) {
		return gsap
			.timeline({ ...(onComplete ? { onComplete } : {}) })
			.to(mesh.position, {
				duration: 0.2,
				x: toXZ.x,
				y: destY,
				z: toXZ.z,
				ease: "none",
			});
	}

	const peakY = destY + 0.6;
	const tl = gsap.timeline({ ...(onComplete ? { onComplete } : {}) });
	tl.to(
		mesh.position,
		{ duration: PIECE_LIFT_S, y: peakY, ease: "power2.out" },
		0,
	);
	tl.to(
		mesh.position,
		{
			duration: PIECE_LIFT_S + PIECE_ARC_S,
			x: toXZ.x,
			z: toXZ.z,
			ease: "power1.inOut",
		},
		0,
	);
	tl.to(
		mesh.position,
		{ duration: PIECE_SETTLE_S, y: destY, ease: "bounce.out" },
		PIECE_LIFT_S + PIECE_ARC_S,
	);
	if (chonk) {
		const pulseStart = PIECE_TOTAL_S * 0.92;
		const pulseDur = PIECE_TOTAL_S * 0.08;
		tl.to(
			mesh.scale,
			{
				duration: pulseDur / 2,
				x: 1.18,
				y: 1.18,
				z: 1.18,
				ease: "power2.out",
			},
			pulseStart,
		);
		tl.to(
			mesh.scale,
			{
				duration: pulseDur / 2,
				x: 1,
				y: 1,
				z: 1,
				ease: "power2.in",
			},
			pulseStart + pulseDur / 2,
		);
	}
	return tl;
}

export interface BoardTipOptions {
	readonly boardGroup: THREE.Object3D;
	/**
	 * Direction of tilt relative to the board's local +Z axis.
	 *
	 * In game terms: the active player gets a NEGATIVE tip — the back
	 * of the board (their opponent's home row) drops lower so the
	 * player's own pieces are foregrounded and they read the back row
	 * unforeshortened. The opponent's resting tilt is positive.
	 */
	readonly direction: 1 | -1;
}

/**
 * Tip the board toward the active player. Drives `boardGroup.rotation.x`
 * to `±tokens.scene.baseTiltMagnitude` over `tokens.motion.boardTipMs`.
 * The drag-to-end-turn gesture interpolates manually during the drag
 * (see `src/scene/input.ts`); this factory is the resting / commit
 * tween.
 */
export function tweenBoardTip(opts: BoardTipOptions): gsap.core.Tween {
	const { boardGroup, direction } = opts;
	const target = direction * tokens.scene.baseTiltMagnitude;
	if (reducedMotion()) {
		boardGroup.rotation.x = target;
		return gsap.to({}, { duration: 0.001 });
	}
	return gsap.to(boardGroup.rotation, {
		duration: BOARD_TIP_S,
		x: target,
		ease: "power2.inOut",
	});
}

export interface CoinSpinOptions {
	readonly coin: THREE.Object3D;
	readonly faceUp: "red" | "white";
	readonly onComplete?: () => void;
}

const COIN_BASE_REVOLUTIONS = 6;

export function tweenCoinSpin(opts: CoinSpinOptions): gsap.core.Tween {
	const { coin, faceUp, onComplete } = opts;
	const finalRotation =
		faceUp === "red"
			? COIN_BASE_REVOLUTIONS * Math.PI * 2
			: COIN_BASE_REVOLUTIONS * Math.PI * 2 + Math.PI;
	if (reducedMotion()) {
		coin.rotation.x = finalRotation;
		const tween = gsap.to({}, { duration: 0.001 });
		if (onComplete) tween.then(onComplete);
		return tween;
	}
	return gsap.to(coin.rotation, {
		duration: COIN_SPIN_S,
		x: finalRotation,
		ease: "power2.out",
		...(onComplete ? { onComplete } : {}),
	});
}

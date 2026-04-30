/**
 * Splitting radial — opens on the top puck of the selected stack
 * whenever stack height ≥ 2.
 *
 * Per docs/DESIGN.md §"The splitting radial":
 *   - Slice count = stack height.
 *   - Tap toggles selection (max N-1 slices selected).
 *   - Hold 3s on the radial → vibrate (Haptics.impact, optional) +
 *     slice flash (gsap pulse on selected slices).
 *   - Drag past threshold → commit; the engine partitions the
 *     selected slices into runs and resolves the split chain.
 *
 * The radial is a vanilla SVG appended to `<div id="overlay">`.
 * Position tracks the top puck via `mountOverlay`'s rAF projector.
 */

import gsap from "gsap";
import type * as THREE from "three";
import { tokens } from "@/design";
import { buildSlicedRadialSvg, mountOverlay, type OverlayHandle } from "./base";

const COMMIT_DRAG_THRESHOLD_PX = 40;

export interface SplitRadialOptions {
	readonly host: HTMLElement;
	readonly camera: THREE.PerspectiveCamera;
	readonly canvas: HTMLCanvasElement;
	readonly diameterPx?: number;
	/** Called when the player completes the hold-to-arm gesture. */
	readonly onArm?: () => void;
	/**
	 * Called when the player commits the drag-to-commit gesture
	 * after arming. `selectedSlices` is sorted ascending. The
	 * caller's job is to translate the slice indices into the
	 * appropriate split action via the engine + dispatch through
	 * the broker.
	 */
	readonly onCommit?: (selectedSlices: ReadonlyArray<number>) => void;
}

export interface SplitRadialHandle {
	open(target: THREE.Object3D, stackHeight: number): void;
	close(): void;
	readonly isOpen: boolean;
	update(): void;
	getSelectedSlices(): ReadonlyArray<number>;
	dispose(): void;
}

const DEFAULT_DIAMETER_PX = 132;

export function buildSplitRadial(opts: SplitRadialOptions): SplitRadialHandle {
	const diameterPx = opts.diameterPx ?? DEFAULT_DIAMETER_PX;

	let active: {
		overlay: OverlayHandle;
		stackHeight: number;
		selected: Set<number>;
		openTween: gsap.core.Tween;
		armed: boolean;
		holdTimer: number | null;
		holdOriginX: number | null;
		holdOriginY: number | null;
		flashTimeline: gsap.core.Timeline | null;
	} | null = null;

	function open(target: THREE.Object3D, stackHeight: number): void {
		if (stackHeight < 2) return;
		if (active) close();

		const svg = buildSlicedRadialSvg({
			diameterPx,
			sliceCount: stackHeight,
			idleFill: tokens.splitRadial.idleFill,
			idleStroke: tokens.splitRadial.idleStroke,
		});

		const overlay = mountOverlay({
			host: opts.host,
			target,
			camera: opts.camera,
			canvas: opts.canvas,
			svg,
			diameterPx,
			cssClass: "ck-split-radial",
		});

		const selected = new Set<number>();

		// Slice click toggles selection (capped at N-1 — see RULES.md).
		// Pre-arm only — once armed, taps are ignored and pointermove
		// drives the commit gesture.
		svg.addEventListener("pointerdown", (e: PointerEvent) => {
			e.stopPropagation();
			if (!active) return;
			const target = e.target as Element;
			const idxStr = target.getAttribute?.("data-slice-index");
			if (idxStr !== null && idxStr !== undefined && !active.armed) {
				const idx = Number.parseInt(idxStr, 10);
				if (!Number.isNaN(idx) && idx >= 0 && idx < stackHeight) {
					if (selected.has(idx)) {
						selected.delete(idx);
						paintSlice(svg, idx, "idle");
					} else if (selected.size < stackHeight - 1) {
						selected.add(idx);
						paintSlice(svg, idx, "selected");
					}
				}
			}
			// If at least one slice is selected, start the hold timer.
			if (selected.size > 0 && active.holdTimer === null) {
				active.holdOriginX = e.clientX;
				active.holdOriginY = e.clientY;
				active.holdTimer = window.setTimeout(() => {
					if (!active) return;
					active.holdTimer = null;
					active.armed = true;
					triggerArmedFlash(svg, selected);
					opts.onArm?.();
					try {
						navigator.vibrate?.(200);
					} catch {
						// Vibration API unsupported — silent.
					}
				}, tokens.motion.splitHoldMs);
			}
		});

		svg.addEventListener("pointermove", (e: PointerEvent) => {
			if (!active) return;
			if (!active.armed) {
				// Cancel hold if pointer moves more than a small threshold
				// before arm — the player is dragging without holding,
				// which should not commit.
				if (active.holdTimer === null) return;
				const ox = active.holdOriginX ?? e.clientX;
				const oy = active.holdOriginY ?? e.clientY;
				const dx = e.clientX - ox;
				const dy = e.clientY - oy;
				if (Math.hypot(dx, dy) > 8) {
					window.clearTimeout(active.holdTimer);
					active.holdTimer = null;
					active.holdOriginX = null;
					active.holdOriginY = null;
				}
				return;
			}
			// Armed — drag past threshold commits.
			const ox = active.holdOriginX ?? e.clientX;
			const oy = active.holdOriginY ?? e.clientY;
			const dx = e.clientX - ox;
			const dy = e.clientY - oy;
			if (Math.hypot(dx, dy) > COMMIT_DRAG_THRESHOLD_PX) {
				const selectedCopy = [...selected].sort((a, b) => a - b);
				close();
				opts.onCommit?.(selectedCopy);
			}
		});

		svg.addEventListener("pointerup", () => {
			if (!active) return;
			if (active.holdTimer !== null) {
				window.clearTimeout(active.holdTimer);
				active.holdTimer = null;
			}
			active.holdOriginX = null;
			active.holdOriginY = null;
			// If armed but released without drag past threshold, leave
			// the radial open so the player can retry the drag. Don't
			// auto-close — the visual flash makes "you're armed" obvious.
		});

		const openTween = gsap.from(svg, {
			duration: tokens.motion.uiOpenMs / 1000,
			scale: 0.8,
			opacity: 0,
			transformOrigin: "center center",
			ease: "power2.out",
		});

		active = {
			overlay,
			stackHeight,
			selected,
			openTween,
			armed: false,
			holdTimer: null,
			holdOriginX: null,
			holdOriginY: null,
			flashTimeline: null,
		};
	}

	function close(): void {
		if (!active) return;
		const { overlay, openTween, holdTimer, flashTimeline } = active;
		openTween.kill();
		flashTimeline?.kill();
		if (holdTimer !== null) window.clearTimeout(holdTimer);
		gsap.to(overlay.svg, {
			duration: tokens.motion.uiCloseMs / 1000,
			scale: 0.85,
			opacity: 0,
			ease: "power1.in",
			onComplete: () => overlay.dispose(),
		});
		active = null;
	}

	function update(): void {
		active?.overlay.update();
	}

	function getSelectedSlices(): ReadonlyArray<number> {
		if (!active) return [];
		return [...active.selected].sort((a, b) => a - b);
	}

	function dispose(): void {
		if (active) {
			active.openTween.kill();
			active.flashTimeline?.kill();
			if (active.holdTimer !== null) window.clearTimeout(active.holdTimer);
			active.overlay.dispose();
			active = null;
		}
	}

	return {
		open,
		close,
		get isOpen(): boolean {
			return active !== null;
		},
		update,
		getSelectedSlices,
		dispose,
	};
}

function triggerArmedFlash(svg: SVGSVGElement, selected: Set<number>): void {
	for (const idx of selected) {
		paintSlice(svg, idx, "holdReady");
	}
	const paths: SVGPathElement[] = [];
	for (const idx of selected) {
		const el = svg.querySelector(`[data-slice-index="${idx}"]`);
		if (el instanceof SVGPathElement) paths.push(el);
	}
	gsap.to(paths, {
		duration: tokens.motion.uiFlashMs / 1000,
		opacity: 0.5,
		yoyo: true,
		repeat: -1,
		ease: "sine.inOut",
	});
}

function paintSlice(
	svg: SVGSVGElement,
	idx: number,
	state: "idle" | "selected" | "holdReady",
): void {
	const path = svg.querySelector(`[data-slice-index="${idx}"]`);
	if (!(path instanceof SVGPathElement)) return;
	if (state === "selected") {
		path.setAttribute("fill", tokens.splitRadial.selectedFill);
		path.setAttribute("stroke", tokens.splitRadial.selectedStroke);
	} else if (state === "holdReady") {
		path.setAttribute("fill", tokens.splitRadial.holdReadyFill);
		path.setAttribute("stroke", tokens.splitRadial.holdReadyStroke);
	} else {
		path.setAttribute("fill", tokens.splitRadial.idleFill);
		path.setAttribute("stroke", tokens.splitRadial.idleStroke);
	}
}

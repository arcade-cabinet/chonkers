/**
 * Splitting radial — opens on the top puck of the selected stack
 * whenever stack height ≥ 2.
 *
 * Per docs/DESIGN.md §"The splitting radial":
 *   - Slice count = stack height.
 *   - Tap toggles selection (max N-1 slices selected).
 *   - Hold 3s on the radial → vibrate (Haptics.impact, wired in
 *     PRQ-T7+T8) + slice flash (gsap pulse on selected slices).
 *   - Drag past threshold → commit; the engine partitions the
 *     selected slices into runs and resolves the split chain.
 *
 * The radial is a vanilla SVG appended to `<div id="overlay">`.
 * Position tracks the top puck via `mountOverlay`'s rAF projector.
 *
 * PRQ-T5+T6 wires up the radial geometry, slice-tap selection, and
 * the open/close lifecycle. The full hold-to-arm + drag-to-commit
 * gesture chain lands in PRQ-T7+T8 alongside haptics.
 */

import gsap from "gsap";
import type * as THREE from "three";
import { tokens } from "@/design";
import { buildSlicedRadialSvg, mountOverlay, type OverlayHandle } from "./base";

export interface SplitRadialOptions {
	readonly host: HTMLElement;
	readonly camera: THREE.PerspectiveCamera;
	readonly canvas: HTMLCanvasElement;
	/** Diameter of the radial in CSS pixels. */
	readonly diameterPx?: number;
}

export interface SplitRadialHandle {
	/**
	 * Open the radial above the given target puck for a stack of
	 * the given height. If a radial is already open, it's torn down
	 * first.
	 */
	open(target: THREE.Object3D, stackHeight: number): void;
	/** Close the radial without committing. */
	close(): void;
	/** Whether a radial is currently open. */
	readonly isOpen: boolean;
	/** Per-frame projector — call from the rAF loop while open. */
	update(): void;
	/** Read-only snapshot of which slice indices are currently selected. */
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
		openTimeline: gsap.core.Tween;
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
		svg.addEventListener("pointerdown", (e: PointerEvent) => {
			e.stopPropagation();
			const target = e.target as Element;
			const idxStr = target.getAttribute?.("data-slice-index");
			if (idxStr === null || idxStr === undefined) return;
			const idx = Number.parseInt(idxStr, 10);
			if (Number.isNaN(idx) || idx < 0 || idx >= stackHeight) return;
			if (selected.has(idx)) {
				selected.delete(idx);
				paintSlice(svg, idx, "idle");
			} else if (selected.size < stackHeight - 1) {
				selected.add(idx);
				paintSlice(svg, idx, "selected");
			}
		});

		const openTimeline = gsap.from(svg, {
			duration: tokens.motion.uiOpenMs / 1000,
			scale: 0.8,
			opacity: 0,
			transformOrigin: "center center",
			ease: "power2.out",
		});

		active = { overlay, stackHeight, selected, openTimeline };
	}

	function close(): void {
		if (!active) return;
		const { overlay, openTimeline } = active;
		openTimeline.kill();
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
			active.openTimeline.kill();
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

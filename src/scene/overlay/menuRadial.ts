/**
 * Generic menu radial — N labelled slices, each invoking a callback
 * on tap. Used by pause, end-game, and settings surfaces.
 *
 * Single-tap slice → fires the slice's `onSelect` and closes the
 * radial. No hold-to-arm or drag — those live on the splitting
 * radial which has different semantics.
 */

import gsap from "gsap";
import type * as THREE from "three";
import { tokens } from "@/design";
import { buildSlicedRadialSvg, mountOverlay, type OverlayHandle } from "./base";

const DEFAULT_DIAMETER_PX = 180;

export interface MenuRadialSlice {
	readonly label: string;
	readonly onSelect: () => void;
	readonly disabled?: boolean;
}

export interface MenuRadialOptions {
	readonly host: HTMLElement;
	readonly camera: THREE.PerspectiveCamera;
	readonly canvas: HTMLCanvasElement;
	readonly target: THREE.Object3D;
	readonly slices: ReadonlyArray<MenuRadialSlice>;
	readonly diameterPx?: number;
}

export interface MenuRadialHandle {
	close(): void;
	update(): void;
}

export function openMenuRadial(opts: MenuRadialOptions): MenuRadialHandle {
	const diameterPx = opts.diameterPx ?? DEFAULT_DIAMETER_PX;
	const sliceCount = opts.slices.length;

	const svg = buildSlicedRadialSvg({
		diameterPx,
		sliceCount,
		idleFill: tokens.splitRadial.idleFill,
		idleStroke: tokens.splitRadial.idleStroke,
	});

	// Add text labels per slice. Position each label at the slice's
	// midpoint along its radial.
	const NS = "http://www.w3.org/2000/svg";
	const r = diameterPx / 2;
	const innerR = 0.35 * r;
	const labelRadius = (innerR + r) / 2;
	const angleStep = (Math.PI * 2) / sliceCount;
	for (let i = 0; i < sliceCount; i += 1) {
		const slice = opts.slices[i];
		if (!slice) continue;
		const start = -Math.PI / 2 + i * angleStep;
		const mid = start + angleStep / 2;
		const text = document.createElementNS(NS, "text");
		text.setAttribute("x", String(labelRadius * Math.cos(mid)));
		text.setAttribute("y", String(labelRadius * Math.sin(mid)));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.setAttribute("fill", tokens.ink.inverse);
		text.setAttribute("font-size", "13");
		text.setAttribute("font-family", tokens.font.body);
		text.setAttribute("pointer-events", "none");
		text.style.userSelect = "none";
		text.textContent = slice.label;
		svg.appendChild(text);
		if (slice.disabled) {
			const path = svg.querySelector(`[data-slice-index="${i}"]`);
			if (path instanceof SVGPathElement) {
				path.setAttribute("opacity", "0.4");
				path.style.cursor = "not-allowed";
			}
		}
	}

	const overlay: OverlayHandle = mountOverlay({
		host: opts.host,
		target: opts.target,
		camera: opts.camera,
		canvas: opts.canvas,
		svg,
		diameterPx,
		cssClass: "ck-menu-radial",
	});

	let closed = false;
	function close(): void {
		if (closed) return;
		closed = true;
		gsap.to(svg, {
			duration: tokens.motion.uiCloseMs / 1000,
			scale: 0.85,
			opacity: 0,
			ease: "power1.in",
			onComplete: () => overlay.dispose(),
		});
	}

	svg.addEventListener("pointerdown", (e) => {
		e.stopPropagation();
		const target = e.target as Element;
		const idxStr = target.getAttribute?.("data-slice-index");
		if (idxStr === null || idxStr === undefined) return;
		const idx = Number.parseInt(idxStr, 10);
		if (Number.isNaN(idx) || idx < 0 || idx >= sliceCount) return;
		const slice = opts.slices[idx];
		if (!slice || slice.disabled) return;
		// Visual flash before close.
		const path = svg.querySelector(`[data-slice-index="${idx}"]`);
		if (path instanceof SVGPathElement) {
			path.setAttribute("fill", tokens.splitRadial.holdReadyFill);
		}
		gsap.delayedCall(0.12, () => {
			slice.onSelect();
			close();
		});
	});

	gsap.from(svg, {
		duration: tokens.motion.uiOpenMs / 1000,
		scale: 0.8,
		opacity: 0,
		transformOrigin: "center center",
		ease: "back.out(1.4)",
	});

	return {
		close,
		update: () => overlay.update(),
	};
}

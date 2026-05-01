/**
 * Diegetic SVG overlay primitive.
 *
 * Per docs/DESIGN.md §"Diegetic UI", every interactive surface is an
 * SVG element appended to `<div id="overlay">` (a sibling of the
 * three.js canvas, NOT inside it) and positioned per-frame via
 * `camera.project(targetWorldPosition)`. There is no React reconciler
 * walking the SVG tree — we use direct DOM operations
 * (`document.createElementNS`, `setAttribute`, etc.) so the same
 * trap that bit the original React+R3F implementation (R3F's
 * reconciler treating `<circle>` as `THREE.Circle` and crashing) can
 * never reoccur.
 *
 * Each overlay has:
 *   - A target `THREE.Object3D` (typically a puck) whose world position
 *     drives the SVG's screen-space placement.
 *   - A small DOM container that holds the SVG.
 *   - A per-frame projector function that the scene's rAF loop calls.
 *   - An optional pointer-event handler for slice clicks, drag, etc.
 *
 * The overlay's transform is `translate3d(${x - half}px, ${y - half}px, 0)`
 * so it centres on the projected point. It also hides itself when the
 * target is behind the camera (`v.z >= 1` after projection).
 */

import * as THREE from "three";

export interface OverlayOptions {
	/** The DOM container to mount into — typically `<div id="overlay">`. */
	readonly host: HTMLElement;
	/** Three.js object whose world position the overlay tracks. */
	readonly target: THREE.Object3D;
	/** The active camera. */
	readonly camera: THREE.PerspectiveCamera;
	/** The renderer's canvas (used to derive client size for projection). */
	readonly canvas: HTMLCanvasElement;
	/** SVG inner content + size. */
	readonly svg: SVGSVGElement;
	/** Diameter in CSS pixels; the overlay centres on the projected point. */
	readonly diameterPx: number;
	/** Optional CSS class for outer container styling. */
	readonly cssClass?: string;
}

export interface OverlayHandle {
	readonly svg: SVGSVGElement;
	readonly container: HTMLDivElement;
	/** Call from the rAF loop to update screen-space position. */
	update(): void;
	/** Remove from DOM and stop tracking. */
	dispose(): void;
}

const projectVec = new THREE.Vector3();

export function mountOverlay(opts: OverlayOptions): OverlayHandle {
	const container = document.createElement("div");
	container.style.position = "absolute";
	container.style.top = "0";
	container.style.left = "0";
	container.style.width = `${opts.diameterPx}px`;
	container.style.height = `${opts.diameterPx}px`;
	container.style.pointerEvents = "auto";
	container.style.willChange = "transform";
	if (opts.cssClass) container.classList.add(opts.cssClass);
	container.appendChild(opts.svg);
	opts.host.appendChild(container);

	const half = opts.diameterPx / 2;

	function update(): void {
		const target = opts.target;
		if (!target.parent) {
			// Detached from scene — hide.
			container.style.visibility = "hidden";
			return;
		}
		target.getWorldPosition(projectVec);
		projectVec.project(opts.camera);
		const rect = opts.canvas.getBoundingClientRect();
		const cssX = rect.left + ((projectVec.x + 1) / 2) * rect.width;
		const cssY = rect.top + ((1 - projectVec.y) / 2) * rect.height;
		container.style.transform = `translate3d(${(cssX - half).toFixed(2)}px, ${(cssY - half).toFixed(2)}px, 0)`;
		container.style.visibility = projectVec.z < 1 ? "visible" : "hidden";
	}

	function dispose(): void {
		container.remove();
	}

	return {
		svg: opts.svg,
		container,
		update,
		dispose,
	};
}

/**
 * Build a single-slice full-circle SVG with a glyph in the centre.
 * Used by the lobby Play / Resume affordances and (later) other
 * single-action surfaces.
 */
export function buildSingleSliceSvg(opts: {
	readonly diameterPx: number;
	readonly fillColor: string;
	readonly strokeColor: string;
	readonly glyphPath: string;
	readonly glyphFill: string;
	readonly disabled?: boolean;
	readonly ariaLabel: string;
}): SVGSVGElement {
	const NS = "http://www.w3.org/2000/svg";
	const r = opts.diameterPx / 2;
	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("width", String(opts.diameterPx));
	svg.setAttribute("height", String(opts.diameterPx));
	svg.setAttribute(
		"viewBox",
		`${-r} ${-r} ${opts.diameterPx} ${opts.diameterPx}`,
	);
	svg.setAttribute("role", "button");
	svg.setAttribute("aria-label", opts.ariaLabel);
	svg.setAttribute("tabindex", opts.disabled ? "-1" : "0");
	if (opts.disabled) svg.setAttribute("aria-disabled", "true");
	// Native click fires on Enter for focusable elements; Space scrolls
	// by default — intercept it and re-dispatch as a click so the
	// SVG behaves as a button for keyboard users too.
	svg.addEventListener("keydown", (e) => {
		if (opts.disabled) return;
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		}
	});
	svg.style.cursor = opts.disabled ? "not-allowed" : "pointer";
	svg.style.opacity = opts.disabled ? "0.45" : "1";
	svg.style.filter = "drop-shadow(0 4px 6px rgba(0,0,0,0.55))";

	const ring = document.createElementNS(NS, "circle");
	ring.setAttribute("cx", "0");
	ring.setAttribute("cy", "0");
	ring.setAttribute("r", String(r - 2));
	ring.setAttribute("fill", opts.fillColor);
	ring.setAttribute("stroke", opts.strokeColor);
	ring.setAttribute("stroke-width", "2");
	svg.appendChild(ring);

	const glyph = document.createElementNS(NS, "path");
	glyph.setAttribute("d", opts.glyphPath);
	glyph.setAttribute("fill", opts.glyphFill);
	glyph.setAttribute("stroke", opts.glyphFill);
	glyph.setAttribute("stroke-width", "1.5");
	glyph.setAttribute("stroke-linejoin", "round");
	svg.appendChild(glyph);

	return svg;
}

/**
 * Build an N-slice radial SVG. Slices are pie wedges drawn as
 * SVG paths; each slice is given `data-slice-index` so the host
 * can route pointer events. Used by the splitting radial (PRQ-T6)
 * and pause/end-game radials (PRQ-T7).
 */
export function buildSlicedRadialSvg(opts: {
	readonly diameterPx: number;
	readonly sliceCount: number;
	readonly idleFill: string;
	readonly idleStroke: string;
	readonly innerRadiusFraction?: number;
	/**
	 * Optional accessible name for the radial. When provided, the SVG
	 * carries `role="menu"` + `aria-label`, and each slice path is a
	 * `role="menuitem"` with `aria-label="slice N"`. Required for the
	 * splitting radial — keyboard / screen-reader / Playwright access.
	 */
	readonly ariaLabel?: string;
}): SVGSVGElement {
	const NS = "http://www.w3.org/2000/svg";
	const r = opts.diameterPx / 2;
	const innerR = (opts.innerRadiusFraction ?? 0.35) * r;
	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("width", String(opts.diameterPx));
	svg.setAttribute("height", String(opts.diameterPx));
	svg.setAttribute(
		"viewBox",
		`${-r} ${-r} ${opts.diameterPx} ${opts.diameterPx}`,
	);
	if (opts.ariaLabel) {
		svg.setAttribute("role", "menu");
		svg.setAttribute("aria-label", opts.ariaLabel);
	}
	svg.style.filter = "drop-shadow(0 4px 6px rgba(0,0,0,0.55))";
	svg.style.touchAction = "none";

	const angleStep = (Math.PI * 2) / opts.sliceCount;
	for (let i = 0; i < opts.sliceCount; i += 1) {
		const start = -Math.PI / 2 + i * angleStep;
		const end = start + angleStep;
		const path = document.createElementNS(NS, "path");
		path.setAttribute("d", describeWedgePath(0, 0, innerR, r - 2, start, end));
		path.setAttribute("fill", opts.idleFill);
		path.setAttribute("stroke", opts.idleStroke);
		path.setAttribute("stroke-width", "2");
		path.setAttribute("data-slice-index", String(i));
		if (opts.ariaLabel) {
			path.setAttribute("role", "menuitem");
			path.setAttribute("aria-label", `slice ${i}`);
			path.setAttribute("tabindex", "0");
			// Keyboard activation — Enter / Space dispatch a synthetic
			// pointerdown/pointerup pair on the slice so the radial's
			// existing pointer handlers (drag-paint + hold-to-arm)
			// react identically to keyboard activation.
			path.addEventListener("keydown", (e) => {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					path.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				}
			});
		}
		path.style.cursor = "pointer";
		path.style.transition = "fill 0.18s ease-out, stroke 0.18s ease-out";
		svg.appendChild(path);
	}
	return svg;
}

function describeWedgePath(
	cx: number,
	cy: number,
	innerR: number,
	outerR: number,
	startAngle: number,
	endAngle: number,
): string {
	const x1 = cx + outerR * Math.cos(startAngle);
	const y1 = cy + outerR * Math.sin(startAngle);
	const x2 = cx + outerR * Math.cos(endAngle);
	const y2 = cy + outerR * Math.sin(endAngle);
	const x3 = cx + innerR * Math.cos(endAngle);
	const y3 = cy + innerR * Math.sin(endAngle);
	const x4 = cx + innerR * Math.cos(startAngle);
	const y4 = cy + innerR * Math.sin(startAngle);
	const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
	return [
		`M ${x1.toFixed(3)} ${y1.toFixed(3)}`,
		`A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`,
		`L ${x3.toFixed(3)} ${y3.toFixed(3)}`,
		`A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(3)} ${y4.toFixed(3)}`,
		"Z",
	].join(" ");
}

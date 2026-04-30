/**
 * Radial split overlay — the single piece-top primitive.
 *
 * Per RULES.md §5.1 + DESIGN.md "The split overlay", this is a 2D
 * SVG radial drawn ABOVE the R3F canvas. The overlay is rendered
 * via React `createPortal` to `document.body` and screen-projected
 * every frame using `useFrame` + `camera.project()`. We do NOT use
 * drei's `<Html>` because that component leaks DOM nodes on
 * mount/unmount AND on position changes (drei issue #2499 — closed
 * but still unfixed in the current 10.7.7 release; milestoned for
 * v11/WebGPU which hasn't shipped). A drei `<Html>` would mount
 * once per radial location and shed DOM nodes every camera tilt,
 * which adds up to OOM during long playthroughs.
 *
 * The overlay shows H pie slices for a stack of height H, where:
 *
 *   - Slice index 0 is the TOP-LEFT wedge.
 *   - Slice indices count counter-clockwise: top-left → bottom-left
 *     → bottom-right → top-right (TL→BL→BR→TR for a 4-stack).
 *   - The slice at traversal-position-`k` corresponds to the `k`-th
 *     piece from the TOP of the stack — slice 0 = top piece, slice
 *     H-1 = bottom piece.
 *   - Mid-stack pulls are physically impossible by construction:
 *     because runs commit in slice-index ascending order across
 *     however many turns it takes (RULES §5.4), every legal
 *     contiguous-run partition resolves into "lift the top K of the
 *     residual" at each commit step. Engine `partitionRuns` +
 *     `rebaseTopDownIndices` already do the right thing.
 *
 * This component is presentational only — it owns NO sim state. A
 * parent (Pieces / DemoPieces / Lobby) wires the slice-tap, hold-
 * to-arm, and drag-to-commit handlers to broker actions. Each slice
 * is a real `<button>` so screen readers + keyboard nav + the
 * golden-path Playwright spec can drive it without a test-hook
 * escape hatch.
 *
 * Three configurations, one component:
 *   1. Live split UI on a stack of height ≥ 2 the player controls
 *      → full radial, all states, hold-to-arm, drag-to-commit.
 *   2. Top-color cap on every owned stack → degenerate decorative
 *      radial with one wedge filled in the controlling color.
 *   3. Lobby demo affordance → 2-stack with two half-moons, each
 *      carrying a play / fast-forward icon, single-tap commit.
 *
 * Geometry: the SVG canvas is `2 * outerRadius` square, centred on
 * the piece's screen-projected position. Slices are angular wedges
 * with inner-radius gap (so the overlay reads as a ring, not a
 * full disc), drawn via SVG `path` arcs. Wedge geometry is
 * computed once per `slices` value.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { tokens } from "@/design/tokens";

export type SliceState =
	| "idle"
	| "hovered"
	| "selected"
	| "armed"
	| "committed";

export interface RadialOverlayProps {
	/** World position to anchor the overlay (centre of the stack's top puck). */
	readonly position: readonly [number, number, number];
	/** Total number of slices (= stack height). */
	readonly slices: number;
	/** Slice indices currently selected by the player (top-down, 0-based). */
	readonly selected?: ReadonlySet<number> | undefined;
	/** True iff the hold-to-arm timer has fired (after 3000ms continuous press). */
	readonly armed?: boolean | undefined;
	/** True iff the drag-to-commit phase has started (selected slices follow pointer). */
	readonly committed?: boolean | undefined;
	/**
	 * Optional per-slice content. If omitted, slices render empty
	 * (just the wedge fill). Used by the lobby demo to put play /
	 * fast-forward glyphs inside the wedges, and by the top-cap
	 * configuration to put the controlling color inside the single
	 * wedge.
	 *
	 * `index` is the slice-traversal index (0 = top-left, then
	 * counter-clockwise).
	 */
	readonly slotContent?: ((index: number) => React.ReactNode) | undefined;
	/**
	 * Optional accessible label per slice. Defaults to "Slice K of N"
	 * if omitted. Set explicit names for the lobby demo ("Play",
	 * "Resume") so the golden-path spec can find buttons by name.
	 */
	readonly slotLabel?: ((index: number) => string) | undefined;
	/** Slice-tap handler. Called on click + space/enter on the focused button. */
	readonly onSelectSlice?: ((index: number) => void) | undefined;
	/**
	 * Hold-to-arm callback. Fires after `holdMs` (default 3000) of
	 * continuous pointer-down anywhere on the overlay. Per RULES.md
	 * §5.2 the caller should: flash the selected slices, vibrate via
	 * Capacitor Haptics if available, set `armed=true`. Only enabled
	 * when at least one slice is currently selected.
	 */
	readonly onArm?: (() => void) | undefined;
	/**
	 * Drag-to-commit callback. Fires when an ARMED hold transitions
	 * into a pointermove with displacement > 8px from the press
	 * origin. Per RULES.md §5.3 the caller should detach the selected
	 * slices and route the drag to a destination cell. Receives the
	 * pointer's client coordinates so the caller can hit-test for the
	 * legal destination.
	 */
	readonly onCommit?:
		| ((evt: { clientX: number; clientY: number }) => void)
		| undefined;
	/**
	 * Hold duration in ms. Defaults to 3000 (RULES §5.2). Lowered in
	 * tests + the visual harness to keep spec wall-clock tight.
	 */
	readonly holdMs?: number | undefined;
	/**
	 * Outer radius in pixels. Default sized for a typical puck at the
	 * design camera; lobby demo + live splits both work at 90px.
	 */
	readonly outerRadius?: number | undefined;
	/**
	 * Inner radius in pixels (the central hole). Default = 35% of
	 * outer; the ring-shape avoids occluding the piece beneath.
	 */
	readonly innerRadius?: number | undefined;
	/**
	 * Optional fill colour shorthand for ALL wedges. Used by the
	 * top-cap configuration where every wedge of a single-colour
	 * stack reads with the controlling color. Per-wedge state still
	 * applies on top of this.
	 */
	readonly tint?: string | undefined;
}

const DEFAULT_OUTER = 90;
const DEFAULT_INNER_FACTOR = 0.35;

interface SliceGeom {
	readonly index: number;
	readonly path: string;
	readonly midAngle: number; // radians; for slot content positioning
	readonly midRadius: number;
}

/**
 * Compute the SVG path for slice `index` of an `H`-wedge ring.
 *
 * Slices fill 360°/H each. Slice 0 starts at the TOP-LEFT (angle =
 * -π/2 - π/H, i.e. half a slice west of vertical-up). Indices then
 * increase COUNTER-CLOCKWISE so:
 *   slice 0 = TL
 *   slice 1 = BL (or just below TL for H=3)
 *   ...
 *   slice H-1 = TR (or just to the right of TL for H=2)
 *
 * For H=2 (half-moons): slice 0 = left half, slice 1 = right half.
 * For H=4: TL / BL / BR / TR clockwise → slices 0 / 1 / 2 / 3.
 * For H=6: 60° wedges starting at top-left and sweeping
 *          counter-clockwise.
 */
function computeSlices(
	H: number,
	outerR: number,
	innerR: number,
): ReadonlyArray<SliceGeom> {
	const slices: SliceGeom[] = [];
	const wedge = (Math.PI * 2) / H;
	// Start angle: half a wedge to the LEFT of straight-up, so the
	// boundary between slice (H-1) and slice 0 sits at vertical-up
	// and slice 0 occupies the top-left quadrant.
	const start = -Math.PI / 2 - wedge / 2;
	for (let i = 0; i < H; i += 1) {
		// Counter-clockwise: each subsequent slice sweeps to LARGER
		// angle in screen-space (which, given screen Y points DOWN,
		// reads as moving down-and-around-the-LEFT — i.e. counter-
		// clockwise from the user's POV).
		const a0 = start + i * wedge;
		const a1 = a0 + wedge;
		const x0o = Math.cos(a0) * outerR;
		const y0o = Math.sin(a0) * outerR;
		const x1o = Math.cos(a1) * outerR;
		const y1o = Math.sin(a1) * outerR;
		const x0i = Math.cos(a0) * innerR;
		const y0i = Math.sin(a0) * innerR;
		const x1i = Math.cos(a1) * innerR;
		const y1i = Math.sin(a1) * innerR;
		const largeArc = wedge > Math.PI ? 1 : 0;
		// Path: outer arc from a0→a1, then line to inner-a1, inner
		// arc from a1→a0 (sweep the other way), close.
		const path = [
			`M ${x0o.toFixed(2)} ${y0o.toFixed(2)}`,
			`A ${outerR} ${outerR} 0 ${largeArc} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)}`,
			`L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`,
			`A ${innerR} ${innerR} 0 ${largeArc} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)}`,
			"Z",
		].join(" ");
		const midAngle = (a0 + a1) / 2;
		const midRadius = (innerR + outerR) / 2;
		slices.push({ index: i, path, midAngle, midRadius });
	}
	return slices;
}

/**
 * Pick wedge fill / stroke / opacity for a given state. Sourced from
 * `tokens.splitRadial.*` so rc fine-tuning lands on a single design
 * surface.
 */
function styleForState(
	state: SliceState,
	tint: string | undefined,
): { fill: string; stroke: string; opacity: number } {
	const r = tokens.splitRadial;
	if (state === "armed") {
		return {
			fill: r.holdReadyFill,
			stroke: r.holdReadyStroke,
			opacity: 1,
		};
	}
	if (state === "selected") {
		return {
			fill: r.selectedFill,
			stroke: r.selectedStroke,
			opacity: 1,
		};
	}
	if (state === "committed") {
		return {
			fill: r.selectedFill,
			stroke: r.selectedStroke,
			opacity: r.committedOpacity,
		};
	}
	if (state === "hovered") {
		return {
			fill: tint ?? r.idleFill,
			stroke: r.hoveredStroke,
			opacity: 1,
		};
	}
	// idle
	return {
		fill: tint ?? r.idleFill,
		stroke: r.idleStroke,
		opacity: 0.85,
	};
}

const DRAG_THRESHOLD_PX = 8;
const DEFAULT_HOLD_MS = 3000;

export function RadialOverlay({
	position,
	slices,
	selected,
	armed = false,
	committed = false,
	slotContent,
	slotLabel,
	onSelectSlice,
	onArm,
	onCommit,
	holdMs = DEFAULT_HOLD_MS,
	outerRadius = DEFAULT_OUTER,
	innerRadius,
	tint,
}: RadialOverlayProps): React.ReactElement | null {
	const innerR = innerRadius ?? outerRadius * DEFAULT_INNER_FACTOR;
	const geom = useMemo(
		() => computeSlices(slices, outerRadius, innerR),
		[slices, outerRadius, innerR],
	);

	// Hold-to-arm + drag-to-commit gesture state. Refs (not state)
	// because we don't need re-renders for the gesture itself — the
	// component re-renders when `armed` flips via the parent's trait
	// subscription. The pointerId guards against multi-touch confusion.
	const pressOriginRef = useRef<{
		x: number;
		y: number;
		pointerId: number;
	} | null>(null);
	const holdTimerRef = useRef<number | null>(null);
	const armedRef = useRef(armed);
	armedRef.current = armed;

	// Manual screen-projection portal — replaces drei `<Html>` (drei
	// #2499 leak). The wrapper div is created once on mount, attached
	// to document.body, and updated every frame with the projected
	// pixel position. createPortal renders the SVG into the wrapper.
	// Lifecycle: useEffect creates the div, returns an unmount cleanup
	// that detaches + removes it. Per-frame updates write to a CSS
	// transform via the wrapper ref.
	const { camera, gl } = useThree();
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const projectVecRef = useRef(new THREE.Vector3());
	useEffect(() => {
		const div = document.createElement("div");
		div.style.position = "absolute";
		div.style.top = "0";
		div.style.left = "0";
		div.style.pointerEvents = "auto";
		div.style.zIndex = "100";
		div.style.willChange = "transform";
		document.body.appendChild(div);
		wrapperRef.current = div;
		return () => {
			div.remove();
			wrapperRef.current = null;
		};
	}, []);
	useFrame(() => {
		const div = wrapperRef.current;
		if (!div) return;
		const v = projectVecRef.current;
		v.set(position[0], position[1], position[2]);
		v.project(camera);
		// NDC → CSS pixels relative to the canvas's bounding rect.
		const rect = gl.domElement.getBoundingClientRect();
		const cssX = rect.left + ((v.x + 1) / 2) * rect.width;
		const cssY = rect.top + ((1 - v.y) / 2) * rect.height;
		// Centre the SVG on the projected point. -50% on both axes
		// matches drei's `center` prop semantics.
		const half = outerRadius;
		div.style.transform = `translate3d(${(cssX - half).toFixed(2)}px, ${(cssY - half).toFixed(2)}px, 0)`;
		// Hide if behind the camera (z > 1 post-projection).
		div.style.visibility = v.z < 1 ? "visible" : "hidden";
	});

	// Unmount cleanup (PRQ-A1 audit 2026-04-30 — hazard H1). The
	// hold timer is started in handlePointerDown and cleared in
	// pointerUp / pointerCancel / pre-arm-cancel branches. But if
	// the component unmounts while a hold is in flight (selection
	// flips, AI moves the player's stack, match ends), none of those
	// branches fire and the timer fires `onArm()` against a stale
	// closure ~3000ms later — spurious sound, spurious haptic,
	// spurious broker action. This effect catches the unmount path.
	// Cited: pmndrs/react-three-fiber #802 (setInterval-not-cleared
	// pattern) — same shape applies to setTimeout.
	useEffect(() => {
		return () => {
			if (holdTimerRef.current !== null) {
				window.clearTimeout(holdTimerRef.current);
				holdTimerRef.current = null;
			}
			pressOriginRef.current = null;
		};
	}, []);

	if (slices < 1) return null;

	const handlePointerDown = (e: React.PointerEvent<SVGRectElement>): void => {
		// Only start the hold if the parent supplied an arm handler
		// AND there's something to commit (selection non-empty). Mouse
		// down on the gesture rect doesn't clear or set anything else
		// — wedge taps go through their own foreignObject buttons.
		if (!onArm || !selected || selected.size === 0) return;
		// Ignore if a different pointer is already engaged (multi-touch).
		if (pressOriginRef.current !== null) return;
		(e.target as Element).setPointerCapture?.(e.pointerId);
		pressOriginRef.current = {
			x: e.clientX,
			y: e.clientY,
			pointerId: e.pointerId,
		};
		// Start the hold timer. On fire, run onArm() — caller flips
		// `armed` via the trait, the next render passes armed=true,
		// and the drag-threshold path becomes active.
		holdTimerRef.current = window.setTimeout(() => {
			holdTimerRef.current = null;
			if (pressOriginRef.current !== null) onArm();
		}, holdMs);
	};

	const handlePointerMove = (e: React.PointerEvent<SVGRectElement>): void => {
		const origin = pressOriginRef.current;
		if (!origin || origin.pointerId !== e.pointerId) return;
		// Pre-arm: if pointer moves beyond the threshold BEFORE the
		// hold timer fires, cancel the hold (the player is dragging
		// without holding — treat as a swipe-cancel per RULES §5.6's
		// implicit cancel rule).
		if (!armedRef.current) {
			const dx = e.clientX - origin.x;
			const dy = e.clientY - origin.y;
			if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
				if (holdTimerRef.current !== null) {
					window.clearTimeout(holdTimerRef.current);
					holdTimerRef.current = null;
				}
				pressOriginRef.current = null;
			}
			return;
		}
		// Post-arm: any pointermove past threshold commits.
		const dx = e.clientX - origin.x;
		const dy = e.clientY - origin.y;
		if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
			pressOriginRef.current = null;
			onCommit?.({ clientX: e.clientX, clientY: e.clientY });
		}
	};

	const handlePointerUp = (e: React.PointerEvent<SVGRectElement>): void => {
		const origin = pressOriginRef.current;
		if (!origin || origin.pointerId !== e.pointerId) return;
		if (holdTimerRef.current !== null) {
			window.clearTimeout(holdTimerRef.current);
			holdTimerRef.current = null;
		}
		pressOriginRef.current = null;
		// If armed but not yet dragged, this is a release-without-drag
		// at the moment of arming. Per RULES §5.3 the drag must follow
		// the arm; a release at arm-time cancels. Caller is responsible
		// for clearing armed-state via the trait when they detect this.
	};

	const stateOf = (i: number): SliceState => {
		const isSel = selected?.has(i) === true;
		if (committed && isSel) return "committed";
		if (armed && isSel) return "armed";
		if (isSel) return "selected";
		return "idle";
	};

	const labelOf = (i: number): string =>
		slotLabel ? slotLabel(i) : `Slice ${i + 1} of ${slices}`;

	// Render the SVG into the `wrapperRef.current` div via portal.
	// On first render, the wrapper isn't created yet (useEffect runs
	// after the first paint); guard by returning null. The next render
	// has the ref populated and the SVG mounts. No drei dependency,
	// no <Html> portal — direct createPortal to a div we own.
	const wrapper = wrapperRef.current;
	if (!wrapper) return null;
	return createPortal(
		<div
			style={{
				width: outerRadius * 2,
				height: outerRadius * 2,
				pointerEvents: "auto",
			}}
		>
			<motion.svg
				role="group"
				aria-label={`Stack split overlay (${slices} slices)`}
				width={outerRadius * 2}
				height={outerRadius * 2}
				viewBox={`${-outerRadius} ${-outerRadius} ${outerRadius * 2} ${outerRadius * 2}`}
				initial={{ opacity: 0, scale: 0.8 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.85 }}
				transition={{ duration: tokens.motion.uiOpenMs / 1000 }}
				style={{ overflow: "visible" }}
			>
				<title>{`${slices}-stack split overlay`}</title>
				{/* Gesture catcher: transparent rect at the bottom of
				 * the SVG z-stack handles the hold-to-arm + drag-to-
				 * commit gestures (RULES §5.2 + §5.3). Only mounts when
				 * the parent supplies an arm handler — for non-
				 * interactive configurations (top-color cap, lobby
				 * single-tap), this rect is absent and pointer events
				 * fall through to the wedges naturally. */}
				{onArm ? (
					<rect
						x={-outerRadius}
						y={-outerRadius}
						width={outerRadius * 2}
						height={outerRadius * 2}
						fill="transparent"
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerUp}
					/>
				) : null}
				{geom.map((g) => {
					const s = stateOf(g.index);
					const style = styleForState(s, tint);
					const label = labelOf(g.index);
					const cx = Math.cos(g.midAngle) * g.midRadius;
					const cy = Math.sin(g.midAngle) * g.midRadius;
					const content = slotContent?.(g.index);
					// Special-case slices === 1: draw a clean circle
					// + (optional) inner-hole ring instead of a single
					// closed-path with full-circle arcs (which leaves
					// a visible seam at the start angle).
					const isSingleSlice = slices === 1;
					return (
						<g key={g.index}>
							{isSingleSlice ? (
								<>
									<motion.circle
										cx={0}
										cy={0}
										r={outerRadius}
										fill={style.fill}
										stroke={style.stroke}
										strokeWidth={2}
										opacity={style.opacity}
										initial={false}
										animate={{
											opacity: style.opacity,
											fill: style.fill,
											stroke: style.stroke,
										}}
										transition={{
											duration: tokens.motion.uiFlashMs / 1000,
										}}
										pointerEvents="none"
									/>
									{innerR > 0 ? (
										<circle
											cx={0}
											cy={0}
											r={innerR}
											fill="transparent"
											stroke={style.stroke}
											strokeWidth={1}
											pointerEvents="none"
										/>
									) : null}
								</>
							) : (
								<motion.path
									d={g.path}
									fill={style.fill}
									stroke={style.stroke}
									strokeWidth={2}
									opacity={style.opacity}
									initial={false}
									animate={{
										opacity: style.opacity,
										fill: style.fill,
										stroke: style.stroke,
									}}
									transition={{
										duration: tokens.motion.uiFlashMs / 1000,
									}}
									// Wedges are decorative — interaction lives
									// on the overlaid <button> below so screen
									// readers + keyboard nav reach the same
									// handler.
									pointerEvents="none"
								/>
							)}
							{/* Optional slot content (icon / colour fill) */}
							{content !== undefined && content !== null ? (
								<g
									transform={`translate(${cx.toFixed(2)} ${cy.toFixed(2)})`}
									pointerEvents="none"
								>
									{content}
								</g>
							) : null}
							{/* Accessible interaction surface — one <button>
							 * per wedge using a foreignObject so the SVG
							 * geometry stays pure. The button's bounding box
							 * matches the wedge's cartesian extent so clicks
							 * land naturally; the actual hit shape is the
							 * inscribed rect, which is acceptable for thumb
							 * targets at typical puck sizes.
							 */}
							{onSelectSlice ? (
								<foreignObject
									x={cx - g.midRadius * 0.45}
									y={cy - g.midRadius * 0.45}
									width={g.midRadius * 0.9}
									height={g.midRadius * 0.9}
								>
									<button
										type="button"
										aria-label={label}
										aria-pressed={s === "selected" || s === "armed"}
										onClick={() => onSelectSlice(g.index)}
										style={{
											width: "100%",
											height: "100%",
											background: "transparent",
											border: "none",
											padding: 0,
											margin: 0,
											cursor: "pointer",
											font: "inherit",
											color: "inherit",
											outline: "none",
										}}
									/>
								</foreignObject>
							) : null}
						</g>
					);
				})}
			</motion.svg>
		</div>,
		wrapper,
	);
}

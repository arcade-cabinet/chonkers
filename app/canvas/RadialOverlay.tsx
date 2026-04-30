/**
 * Radial split overlay — the single piece-top primitive.
 *
 * Per RULES.md §5.1 + DESIGN.md "The split overlay", this is a 2D
 * SVG radial drawn ABOVE the R3F canvas via drei's `<Html>` wrapper
 * (which positions a DOM subtree at a given world position). The
 * overlay shows H pie slices for a stack of height H, where:
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

import { Html } from "@react-three/drei";
import { motion } from "framer-motion";
import { useMemo } from "react";
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

export function RadialOverlay({
	position,
	slices,
	selected,
	armed = false,
	committed = false,
	slotContent,
	slotLabel,
	onSelectSlice,
	outerRadius = DEFAULT_OUTER,
	innerRadius,
	tint,
}: RadialOverlayProps): React.ReactElement | null {
	const innerR = innerRadius ?? outerRadius * DEFAULT_INNER_FACTOR;
	const geom = useMemo(
		() => computeSlices(slices, outerRadius, innerR),
		[slices, outerRadius, innerR],
	);
	if (slices < 1) return null;

	const stateOf = (i: number): SliceState => {
		const isSel = selected?.has(i) === true;
		if (committed && isSel) return "committed";
		if (armed && isSel) return "armed";
		if (isSel) return "selected";
		return "idle";
	};

	const labelOf = (i: number): string =>
		slotLabel ? slotLabel(i) : `Slice ${i + 1} of ${slices}`;

	return (
		<Html
			position={position as unknown as [number, number, number]}
			center
			zIndexRange={[100, 0]}
			pointerEvents="auto"
			// The drei `Html` default `transform` mode would project the
			// SVG into 3D — we want a flat screen-space overlay instead,
			// so leave `transform` off (drei positions the wrapper at
			// the projected pixel of `position` and renders DOM normally).
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
		</Html>
	);
}

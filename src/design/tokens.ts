/**
 * Design tokens for Chonkers — committed source of truth.
 *
 * Hex values are derived from the curated PBR diffuse mid-tones in
 * public/assets/pbr/. CSS counterparts live in src/css/style.css as
 * --ck-* variables; the two sources are kept in lockstep.
 */

export const tokens = {
	wood: {
		boardMain: "#8C5A2B",
		boardHome: "#5A3818",
		pieceRed: "#7A3B22",
		pieceWhite: "#D6BC8A",
	},
	ink: {
		primary: "#1B1410",
		inverse: "#F5EBD8",
	},
	accent: {
		select: "#E8B83A",
		danger: "#C0392B",
		split: "#3FB67A",
	},
	surface: {
		scrim: "rgba(15, 10, 5, 0.72)",
		canvasClear: "#1a120a",
	},
	font: {
		body: '"Lato", system-ui, -apple-system, "Segoe UI", sans-serif',
		display: '"Abril Fatface", "Lato", serif',
	},
	motion: {
		// 2D UI motion budget (framer-motion)
		uiOpenMs: 160,
		// Closing animations (radial close, modal out) are slightly
		// faster than open per UI convention.
		uiCloseMs: 140,
		uiFlashMs: 240,
		modalMs: 180,
		// Cross-fade between top-level Radix screens.
		screenFadeMs: 200,
		// 3D piece motion budget (R3F tweens)
		pieceLiftMs: 120,
		pieceArcMs: 200,
		pieceSettleMs: 100,
		splitExtractMs: 300,
		// Split-arm hold duration
		splitHoldMs: 3000,
	},
	board: {
		cols: 9,
		rows: 11,
		// Cell footprint in world units; one cell is 1×1.
		cellSize: 1,
		// Puck dimensions: radius : height ≈ 1 : 0.4 against cellSize 1.
		puckRadius: 0.42,
		puckHeight: 0.16,
		// Vertical gap between stacked pucks so the wood seam reads.
		puckGap: 0.005,
	},
	// Slice-state tokens for `app/components/SplitRadial.tsx`. The
	// radial cycles through idle → hovered → selected → hold-ready →
	// committed; each state has its own stroke + fill.
	splitRadial: {
		idleStroke: "#1B1410", // ink.primary
		idleFill: "transparent",
		hoveredStroke: "#E8B83A", // accent.select
		selectedFill: "#E8B83A99", // accent.select @ 0.6 alpha
		selectedStroke: "#E8B83A",
		holdReadyFill: "#3FB67A", // accent.split
		holdReadyStroke: "#3FB67A",
		// De-emphasise the radial after the commit-drag begins so the
		// destination cell takes focus.
		committedOpacity: 0.45,
	},
	// Colour banding for `app/components/TurnBadge.tsx`.
	turnBadge: {
		redBg: "#7A3B22", // wood.pieceRed mid-tone
		redInk: "#F5EBD8", // ink.inverse
		whiteBg: "#D6BC8A", // wood.pieceWhite mid-tone
		whiteInk: "#1B1410", // ink.primary
	},
} as const;

export type Tokens = typeof tokens;

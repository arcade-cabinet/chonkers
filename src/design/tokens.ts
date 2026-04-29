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
	},
	font: {
		body: '"Lato", system-ui, -apple-system, "Segoe UI", sans-serif',
		display: '"Abril Fatface", "Lato", serif',
	},
	motion: {
		// 2D UI motion budget (framer-motion)
		uiOpenMs: 160,
		uiFlashMs: 240,
		modalMs: 180,
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
} as const;

export type Tokens = typeof tokens;

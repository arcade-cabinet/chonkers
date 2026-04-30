/**
 * Design tokens for Chonkers — committed source of truth.
 *
 * Hex values are derived from the curated PBR diffuse mid-tones in
 * public/assets/pbr/. Tokens are consumed directly by `src/scene/`
 * (when constructing materials and SVG markup) and by gsap factories
 * in `src/scene/animations.ts` (which read motion durations from
 * `tokens.motion.*`).
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
		canvasClear: "#1a0f08",
	},
	font: {
		body: '"Lato", system-ui, -apple-system, "Segoe UI", sans-serif',
		display: '"Abril Fatface", "Lato", serif',
	},
	motion: {
		// 2D SVG overlay motion (gsap)
		uiOpenMs: 160,
		// Closing animations (radial close, settings out) are slightly
		// faster than open per UI convention.
		uiCloseMs: 140,
		uiFlashMs: 240,
		// 3D piece motion (gsap)
		pieceLiftMs: 120,
		pieceArcMs: 200,
		pieceSettleMs: 100,
		splitExtractMs: 300,
		// Split-arm hold duration before the commit gesture arms.
		splitHoldMs: 3000,
		// Board-tip lerp toward the active player.
		boardTipMs: 320,
		// Coin-flip total spin duration.
		coinFlipMs: 1400,
		// Per-puck stagger during the placement reveal ceremony.
		ceremonyStaggerMs: 90,
		// Bezel knock detector window.
		knockWindowMs: 600,
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
	// Camera + scene-tilt tunables. The "sitting at the table" angle is
	// determined by cameraY (height) and cameraZ (distance back); the
	// tip-toward-active-player magnitude is `baseTiltMagnitude`.
	// Camera angle from horizontal = atan(cameraY / cameraZ) ≈ 40°.
	// At this angle the player reads the board as "leaning over the
	// table" without looking straight down (which kills stack height
	// readability).
	scene: {
		cameraX: 0,
		cameraY: 11,
		cameraZ: 13,
		cameraFov: 38,
		cameraNear: 0.1,
		cameraFar: 100,
		baseTiltMagnitude: Math.PI / 15, // ~12° baseline tilt
		turnTiltDelta: Math.PI / 60, // ~3° added toward active player
	},
	// Cabinet bezel framing the board.
	bezel: {
		frameThickness: 0.6,
		frameDepth: 0.3,
		frameLift: 0.05,
	},
	// Slice-state tokens for the splitting radial. The radial cycles
	// through idle → hovered → selected → hold-ready → committed; each
	// state has its own stroke + fill.
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
	// Colour banding for the diegetic turn indicator (a small lit pip
	// on the bezel that flips colour with the active player).
	turnBadge: {
		redBg: "#7A3B22", // wood.pieceRed mid-tone
		redInk: "#F5EBD8", // ink.inverse
		whiteBg: "#D6BC8A", // wood.pieceWhite mid-tone
		whiteInk: "#1B1410", // ink.primary
	},
} as const;

export type Tokens = typeof tokens;

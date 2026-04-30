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
		// Board tipping animation — TippingBoard's exponential lerp
		// rate. Higher = snappier; 6.0 reads as a smooth ~250ms settle.
		tippingLerpRate: 6.0,
		// Coin-flip total spin duration including ease-out landing.
		coinFlipMs: 1800,
		// Knock-to-forfeit: how long a tap window stays open before
		// the rolling buffer expires + the count requirement.
		knockWindowMs: 600,
		knockTapsRequired: 3,
	},
	// 3D scene framing + tilt geometry. Tunable for rc fine-pass.
	scene: {
		// Camera world position relative to the bezel center; the
		// onCreated hook calls camera.lookAt(0, 0, 0) so position
		// alone determines the view.
		//
		// Tabletop-3/4 framing: camera sits 8 units above + 14 units
		// behind the bezel center, which gives a viewing angle of
		// ~atan(8/14) ≈ 30° from horizontal — high enough that
		// stacked-piece heights register, low enough that the bezel
		// reads as a tabletop the user is leaning over. Camera Z=14
		// pulls the camera back enough to fit the full bezel
		// (outerDepth ≈ 11.9) in the FOV-42° vertical view; closer
		// values clip the front + back slabs out of frame.
		// Previous values (Y=13.2, Z=0.8) sat almost directly overhead;
		// even modest board tilt then read as a wall, not a table.
		cameraX: 0,
		cameraY: 8,
		cameraZ: 14,
		cameraFov: 42,
		cameraNear: 0.1,
		cameraFar: 60,
		// TippingBoard X-axis rotation magnitude when the board
		// tips toward the human (resting bias). Active-side bias
		// is layered on top for AI's-turn / win-loser-side states.
		// Reduced from π/7.2 (~25°) → π/15 (~12°) so the resting
		// bias reads as "table tipped toward you" rather than "table
		// stood on its edge". With the new 3/4 camera, even a modest
		// 12° tilt visibly drops the player's near edge.
		baseTiltMagnitude: Math.PI / 15, // ~12°
		turnTiltDelta: Math.PI / 60, // ~3°
	},
	// Bezel geometry + frame thickness. Bezel.tsx + BezelGestures
	// + BezelButtons read from this surface.
	bezel: {
		frameThickness: 0.45,
		frameDepth: 0.32,
		frameLift: -0.12,
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
	// Slice-state tokens consumed today by `app/canvas/SplitArmHeightBar.tsx`
	// (idle vs armed dot fills). Reserved colour grammar (idle / hovered /
	// selected / hold-ready / committed) for a future radial overlay.
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
	// Colour banding for the `TurnIndicator` pill in `app/screens/PlayView.tsx`.
	turnBadge: {
		redBg: "#7A3B22", // wood.pieceRed mid-tone
		redInk: "#F5EBD8", // ink.inverse
		whiteBg: "#D6BC8A", // wood.pieceWhite mid-tone
		whiteInk: "#1B1410", // ink.primary
	},
} as const;

export type Tokens = typeof tokens;

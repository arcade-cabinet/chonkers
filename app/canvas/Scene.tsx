import { Environment, useContextBridge } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import { ASSETS } from "@/utils/manifest";
import { Bezel } from "./Bezel";
import { BezelGestures } from "./BezelGestures";
import { Board } from "./Board";
import { CanvasHandlersContext } from "./CellClickContext";
import { CellHitboxGrid } from "./CellHitboxGrid";
import { Lighting } from "./Lighting";
import { MoveAnimation } from "./MoveAnimation";
import { Pieces } from "./Pieces";
import { SelectionOverlay } from "./SelectionOverlay";
import { SplitArmHeightBar } from "./SplitArmHeightBar";
import { TippingBoard } from "./TippingBoard";

// Camera frames the bezel from slightly above + slightly back. The
// scene composition reads as "tabletop-from-above" — the BEZEL is
// flat to the camera plane, the BOARD tilts on its center axle
// inside the bezel toward whichever side currently "owns" the
// turn (the player's side drops when it's their turn).
//
// Camera height + fov tuned so the bezel + tilted board fills the
// viewport with all four bezel slabs visible (front/back bezels
// frame the top/bottom of the viewport, side bezels frame the
// left/right). All camera + bezel constants flow from the design-
// system tokens (`tokens.scene.*`, `tokens.bezel.*`) so rc fine-
// tuning lands on a single surface.
const CAMERA_POSITION: [number, number, number] = [
	tokens.scene.cameraX,
	tokens.scene.cameraY,
	tokens.scene.cameraZ,
];

const { cols, rows, cellSize } = tokens.board;
const BOARD_INNER_WIDTH = cols * cellSize;
const BOARD_INNER_DEPTH = rows * cellSize;

/**
 * Top-level R3F scene. Composition: bezel frame in XZ plane fills
 * the frame; board (with pieces, selection overlay, hitboxes) tilts
 * upward inside the bezel cutout. Camera shoots near-overhead with
 * a slight tilt-back so the bezel reads as flat to the user while
 * the board's tilt gives visible stack heights.
 *
 * Renderer config is fully declarative (toneMapping + clear color
 * via props/`<color attach>`). One imperative call: `camera.lookAt`
 * targets the bezel center on first frame.
 */
export function Scene() {
	// Bridge React context across the R3F Canvas boundary. Modern R3F
	// (v9) propagates context by default, but `useContextBridge` is a
	// belt-and-suspenders guarantee that the click + forfeit handlers
	// installed by PlayView/LobbyView reach Pieces / CellHitboxGrid /
	// BezelGestures inside the Canvas tree. Cost: one wrapper render.
	const ContextBridge = useContextBridge(CanvasHandlersContext);
	return (
		<Canvas
			shadows
			dpr={[1, 2]}
			gl={{
				antialias: true,
				toneMapping: THREE.ACESFilmicToneMapping,
				toneMappingExposure: 1.0,
			}}
			camera={{
				position: CAMERA_POSITION,
				fov: tokens.scene.cameraFov,
				near: tokens.scene.cameraNear,
				far: tokens.scene.cameraFar,
			}}
			onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
		>
			<ContextBridge>
				<color attach="background" args={[tokens.surface.canvasClear]} />
				<Suspense fallback={null}>
					<Environment files={ASSETS.hdri} />
					<Lighting />
					{/* Bezel is flat to the camera plane (no rotation) */}
					<Bezel
						innerWidth={BOARD_INNER_WIDTH}
						innerDepth={BOARD_INNER_DEPTH}
					/>
					<BezelGestures
						innerWidth={BOARD_INNER_WIDTH}
						innerDepth={BOARD_INNER_DEPTH}
						frameThickness={tokens.bezel.frameThickness}
					/>
					{/* Board content tilts on its center axle. Resting state
					 * tips toward the human; AI's turn tips back toward AI;
					 * win tips toward the loser as a "table dropped" beat. */}
					<TippingBoard>
						<Board />
						<Pieces />
						<MoveAnimation />
						<SelectionOverlay />
						<SplitArmHeightBar />
						<CellHitboxGrid />
					</TippingBoard>
				</Suspense>
			</ContextBridge>
		</Canvas>
	);
}

import { Environment } from "@react-three/drei";
import { Canvas, type RootState } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import { ASSETS } from "@/utils/manifest";
import { Board } from "./Board";
import { Lighting } from "./Lighting";
import { Pieces } from "./Pieces";
import { SelectionOverlay } from "./SelectionOverlay";

const CAMERA_POSITION: [number, number, number] = [2.4, 9.5, 9];

/**
 * One-shot init when R3F creates the GL context. Three concerns
 * (camera aim, tone mapping, clear color) all happen on first
 * frame; keeping them together avoids multiple onCreated hooks
 * and a useEffect race against Suspense.
 */
function initRenderer({ camera, gl, scene }: RootState) {
	camera.lookAt(0, 0, 0);
	gl.toneMapping = THREE.ACESFilmicToneMapping;
	gl.toneMappingExposure = 1.0;
	scene.background = new THREE.Color(tokens.surface.canvasClear);
}

/**
 * Top-level R3F scene. The board sits at world origin; the camera
 * looks at it from across the red home row, tilted ~40° down.
 *
 * Why no drei <PerspectiveCamera>: drei's variant doesn't auto-lookAt,
 * and we need a guaranteed look-at-origin to make the board visible
 * on first frame. Using R3F's Canvas-level `camera` prop + `onCreated`
 * lookAt is deterministic.
 *
 * <Environment> provides image-based-lighting only — `background` is
 * NOT set so the board reads against contrast (the wood-shadow clear
 * color set in initRenderer) rather than the tone-mapped sky.
 */
export function Scene() {
	return (
		<Canvas
			shadows
			dpr={[1, 2]}
			gl={{ antialias: true }}
			camera={{ position: CAMERA_POSITION, fov: 42, near: 0.1, far: 60 }}
			onCreated={initRenderer}
		>
			<Suspense fallback={null}>
				<Environment files={ASSETS.hdri} />
				<Lighting />
				<group>
					<Board />
					<Pieces />
					<SelectionOverlay />
				</group>
			</Suspense>
		</Canvas>
	);
}

import { Environment } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { ASSETS } from "@/utils/manifest";
import { Board } from "./Board";
import { Lighting } from "./Lighting";
import { Pieces } from "./Pieces";

const CAMERA_POSITION: [number, number, number] = [2.4, 9.5, 9];
const CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

/**
 * Top-level R3F scene. The board sits at world origin; the camera
 * looks at it from across the red home row, tilted ~40° down.
 *
 * Why no drei <PerspectiveCamera>: drei's variant doesn't auto-lookAt,
 * and we need a guaranteed look-at-origin to make the board visible
 * on first frame. Using R3F's built-in `camera` prop on <Canvas> lets
 * us set position + onCreated lookAt deterministically.
 *
 * The HDRI provides image-based lighting only — `background` is NOT
 * set so the board reads against a clean clear color rather than the
 * tone-mapped sky, and the explicit Lighting rig + wood PBR materials
 * carry the look.
 */
export function Scene() {
	return (
		<Canvas
			shadows
			dpr={[1, 2]}
			gl={{ antialias: true }}
			camera={{ position: CAMERA_POSITION, fov: 42, near: 0.1, far: 60 }}
			onCreated={({ camera, gl, scene }) => {
				camera.lookAt(CAMERA_TARGET);
				gl.toneMapping = THREE.ACESFilmicToneMapping;
				gl.toneMappingExposure = 1.0;
				scene.background = new THREE.Color("#1a120a");
			}}
		>
			<Suspense fallback={null}>
				<Environment files={ASSETS.hdri} />
				<Lighting />
				<group>
					<Board />
					<Pieces />
				</group>
			</Suspense>
		</Canvas>
	);
}

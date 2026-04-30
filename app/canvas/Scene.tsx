import { Environment } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
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
 * Top-level R3F scene. The board sits at world origin; the camera
 * looks at it from across the red home row, tilted ~40° down.
 *
 * Renderer config is fully declarative:
 *   - `gl` prop carries antialias + ACESFilmic tone mapping +
 *     exposure (no imperative onCreated reach-in needed).
 *   - `<color attach="background">` sets the scene's clear color
 *     to the wood-shadow token; React reconciles changes if the
 *     token ever shifts.
 *   - `camera` prop seeds position/fov/near/far. Camera lookAt is
 *     the one piece that *is* imperative — drei's
 *     <PerspectiveCamera> doesn't accept a lookAt prop and R3F's
 *     Canvas-level camera prop has no equivalent — so the
 *     onCreated callback aims the camera once at world origin.
 *
 * <Environment> provides image-based-lighting only — `background`
 * is intentionally omitted on the Environment so the board reads
 * against the wood-shadow clear color rather than the tone-mapped
 * sky.
 */
export function Scene() {
	return (
		<Canvas
			shadows
			dpr={[1, 2]}
			gl={{
				antialias: true,
				toneMapping: THREE.ACESFilmicToneMapping,
				toneMappingExposure: 1.0,
			}}
			camera={{ position: CAMERA_POSITION, fov: 42, near: 0.1, far: 60 }}
			onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
		>
			<color attach="background" args={[tokens.surface.canvasClear]} />
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

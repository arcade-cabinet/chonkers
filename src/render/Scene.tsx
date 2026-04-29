import {
	Environment,
	OrthographicCamera,
	PerspectiveCamera,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ASSETS } from "@/assets/manifest";
import { Board } from "./Board";
import { InitialPieces } from "./InitialPieces";
import { Lighting } from "./Lighting";

/**
 * Top-level R3F scene. Renders the tilted board, both home-row
 * gradients, and the 5-4-3 starting layout. Input + game state
 * wiring lands in subsequent commits.
 */
export function Scene() {
	return (
		<Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
			<Suspense fallback={null}>
				<Environment files={ASSETS.hdri} background blur={0.4} />
				<Lighting />
				{/*
				 * Camera sits across from red, tilted ~40° down and slightly
				 * yawed so stack heights read asymmetrically — the way a
				 * player leaning over a real wood board would see them.
				 */}
				<PerspectiveCamera
					makeDefault
					position={[2.4, 9.5, 9]}
					fov={42}
					near={0.1}
					far={60}
				/>
				{/* Render-only orthographic spare for top-down debugging if needed. */}
				<OrthographicCamera position={[0, 30, 0]} zoom={40} />
				<group rotation={[0, 0, 0]}>
					<Board />
					<InitialPieces />
				</group>
			</Suspense>
		</Canvas>
	);
}

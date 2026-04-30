/**
 * Two demo pieces shown in the lobby state — one red on the left
 * of the axle, one white on the right. Tapping either piece
 * initiates the new-match ceremony.
 *
 * When ceremony enters the "demo-clearing" phase, the demo pieces
 * lift up out of frame (Y rises, opacity fades) before the actual
 * gameplay pieces start placing. Reads as "the table being cleared
 * before the match is set up."
 */

import { useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import { Ceremony } from "@/sim";
import { ASSETS } from "@/utils/manifest";
import { useWorldEntity } from "../hooks/useWorldEntity";

const LIFT_DURATION_MS = 700;
const LIFT_HEIGHT = 6.0;
const REST_X = 1.6;

interface Props {
	readonly onTap: () => void;
}

export function DemoPieces({ onTap }: Props) {
	const worldEntity = useWorldEntity();
	const ceremony = useTrait(worldEntity, Ceremony);
	const phase = ceremony?.phase ?? "idle";
	const startedAtMs = ceremony?.startedAtMs ?? 0;

	const red = useTexture({
		diffuse: ASSETS.pbr.redPiece.diffuse,
		normal: ASSETS.pbr.redPiece.normal,
		roughness: ASSETS.pbr.redPiece.roughness,
	});
	const white = useTexture({
		diffuse: ASSETS.pbr.whitePiece.diffuse,
		normal: ASSETS.pbr.whitePiece.normal,
		roughness: ASSETS.pbr.whitePiece.roughness,
	});

	useMemo(() => {
		for (const t of [red.diffuse, red.normal, red.roughness]) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.anisotropy = 8;
		}
		red.diffuse.colorSpace = THREE.SRGBColorSpace;
		for (const t of [white.diffuse, white.normal, white.roughness]) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.anisotropy = 8;
		}
		white.diffuse.colorSpace = THREE.SRGBColorSpace;
	}, [red, white]);

	const { puckRadius, puckHeight } = tokens.board;
	const r = puckRadius * 1.6;
	const h = puckHeight * 1.6;
	const baseY = h / 2;

	const redRef = useRef<THREE.Mesh | null>(null);
	const whiteRef = useRef<THREE.Mesh | null>(null);
	const redMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
	const whiteMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

	useFrame(() => {
		const lifting = phase === "demo-clearing";
		const cleared =
			phase === "placing-first" ||
			phase === "placing-second" ||
			phase === "coin-flip" ||
			phase === "settling";
		// Compute lift progress: 0 at lobby/rest, 0..1 during clearing,
		// 1 once cleared (and beyond — the meshes are invisible).
		let progress = 0;
		if (lifting) {
			const elapsed = performance.now() - startedAtMs;
			progress = Math.max(0, Math.min(1, elapsed / LIFT_DURATION_MS));
		} else if (cleared) {
			progress = 1;
		}
		const eased = easeInQuad(progress);
		const liftY = eased * LIFT_HEIGHT;
		const opacity = 1 - eased;
		if (redRef.current) redRef.current.position.y = baseY + liftY;
		if (whiteRef.current) whiteRef.current.position.y = baseY + liftY;
		if (redMatRef.current) {
			redMatRef.current.opacity = opacity;
			redMatRef.current.transparent = opacity < 1;
		}
		if (whiteMatRef.current) {
			whiteMatRef.current.opacity = opacity;
			whiteMatRef.current.transparent = opacity < 1;
		}
	});

	// Hide entirely once cleared so the meshes don't sit invisible
	// in the scene tree consuming raycaster cycles.
	if (
		phase === "placing-first" ||
		phase === "placing-second" ||
		phase === "coin-flip" ||
		phase === "settling"
	) {
		return null;
	}

	const interactive = phase === "idle";
	const handleTap = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (interactive) onTap();
	};

	return (
		<group>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: <mesh> is R3F three.js, not DOM. */}
			<mesh
				ref={redRef}
				position={[-REST_X, baseY, 0]}
				castShadow
				receiveShadow
				onClick={handleTap}
			>
				<cylinderGeometry args={[r, r, h, 64]} />
				<meshStandardMaterial
					ref={redMatRef}
					map={red.diffuse}
					normalMap={red.normal}
					roughnessMap={red.roughness}
					roughness={0.7}
					metalness={0}
				/>
			</mesh>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: <mesh> is R3F three.js, not DOM. */}
			<mesh
				ref={whiteRef}
				position={[REST_X, baseY, 0]}
				castShadow
				receiveShadow
				onClick={handleTap}
			>
				<cylinderGeometry args={[r, r, h, 64]} />
				<meshStandardMaterial
					ref={whiteMatRef}
					map={white.diffuse}
					normalMap={white.normal}
					roughnessMap={white.roughness}
					roughness={0.7}
					metalness={0}
				/>
			</mesh>
		</group>
	);
}

function easeInQuad(t: number): number {
	return t * t;
}

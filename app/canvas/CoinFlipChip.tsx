/**
 * Two-sided coin chip for the new-match coin flip. A puck-shaped
 * mesh with red on one face, white on the other. Spins along its
 * X axis (so it flips along its diameter, the way a real coin
 * tossed flat would) for ~2 seconds, then settles showing the
 * winning color face-up.
 *
 * The first-player decision is made BEFORE the flip animation
 * starts (decideFirstPlayer + the persisted coin_flip_seed). The
 * chip just visualises the result — settle angle is computed from
 * the winner so the right face lands up regardless of how many
 * full rotations got cycled.
 */

import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Color } from "@/sim";
import { ASSETS } from "@/utils/manifest";

const FLIP_DURATION_MS = 1800;
// Number of full rotations during the flip. Even count means same
// face is up at end as at start; we add +half-rotation when the
// winner is the OTHER face so the resolved settle is correct.
const BASE_FULL_ROTATIONS = 4;

interface Props {
	readonly winner: Color;
	readonly position?: [number, number, number];
	readonly startedAtMs: number;
	readonly onSettled?: () => void;
}

export function CoinFlipChip({
	winner,
	position = [0, 1.2, 0],
	startedAtMs,
	onSettled,
}: Props) {
	const meshRef = useRef<THREE.Mesh | null>(null);
	const settledRef = useRef(false);
	// Top face renders white at rest (rotation 0); winner red means
	// we need to land at half-π (showing bottom face).
	const targetRotation = winner === "red" ? Math.PI : 0;
	const totalRotation = BASE_FULL_ROTATIONS * Math.PI * 2 + targetRotation;

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
		red.diffuse.colorSpace = THREE.SRGBColorSpace;
		white.diffuse.colorSpace = THREE.SRGBColorSpace;
	}, [red, white]);

	const redMaterial = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				map: red.diffuse,
				normalMap: red.normal,
				roughnessMap: red.roughness,
				roughness: 0.6,
				metalness: 0,
			}),
		[red],
	);
	const whiteMaterial = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				map: white.diffuse,
				normalMap: white.normal,
				roughnessMap: white.roughness,
				roughness: 0.6,
				metalness: 0,
			}),
		[white],
	);
	const edgeMaterial = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				color: "#3a2a1a",
				roughness: 0.78,
				metalness: 0,
			}),
		[],
	);
	// CylinderGeometry material order: [side, top, bottom]
	const materials = useMemo(
		() => [edgeMaterial, whiteMaterial, redMaterial],
		[edgeMaterial, whiteMaterial, redMaterial],
	);

	useFrame(() => {
		const m = meshRef.current;
		if (!m) return;
		const elapsed = performance.now() - startedAtMs;
		if (elapsed <= 0) return;
		const tNorm = Math.min(1, elapsed / FLIP_DURATION_MS);
		// Eased flip — fast spin start, gentle landing.
		const eased = easeOutCubic(tNorm);
		const angle = eased * totalRotation;
		m.rotation.x = angle;
		// Slight upward arc + settle bob.
		const bob = Math.sin(tNorm * Math.PI) * 0.4;
		m.position.y = (position[1] ?? 1.2) + bob;

		if (tNorm >= 1 && !settledRef.current) {
			settledRef.current = true;
			onSettled?.();
		}
	});

	return (
		<mesh
			ref={meshRef}
			position={position}
			castShadow
			receiveShadow
			material={materials}
		>
			<cylinderGeometry args={[0.7, 0.7, 0.18, 64]} />
		</mesh>
	);
}

function easeOutCubic(t: number): number {
	const u = 1 - t;
	return 1 - u * u * u;
}

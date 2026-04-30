/**
 * The wood bezel that frames the play surface. Sits in the XZ
 * plane (flat to the camera's overhead view) — the play surface
 * tilts UPWARD inside this frame to give perceived depth without
 * tilting the camera.
 *
 * Geometry: an outer rectangle minus an inner cutout sized to the
 * board footprint. Built as four trapezoidal slabs (top / bottom /
 * left / right) so the inner edges can chamfer toward the tilted
 * play surface without visible seams.
 *
 * Texture: dark_wooden_planks PBR set from polyhaven — chosen as
 * the visually heavier complement to the warm WoodFloor007 main
 * playfield. Tiled at a low repeat so the plank pattern reads
 * across the long beams of the frame.
 */

import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import { ASSETS } from "@/utils/manifest";

const FRAME_THICKNESS = 0.45;
const FRAME_DEPTH = 0.32;
const FRAME_LIFT = -0.12;

interface Props {
	readonly innerWidth: number;
	readonly innerDepth: number;
}

export function Bezel({ innerWidth, innerDepth }: Props) {
	const { diffuse, normal, roughness, ao } = useTexture({
		diffuse: ASSETS.pbr.bezel.diffuse,
		normal: ASSETS.pbr.bezel.normal,
		roughness: ASSETS.pbr.bezel.roughness,
		ao: ASSETS.pbr.bezel.ao,
	});

	useMemo(() => {
		for (const t of [diffuse, normal, roughness, ao]) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.repeat.set(2, 0.6);
			t.anisotropy = 8;
		}
		diffuse.colorSpace = THREE.SRGBColorSpace;
	}, [diffuse, normal, roughness, ao]);

	const outerWidth = innerWidth + FRAME_THICKNESS * 2;
	const outerDepth = innerDepth + FRAME_THICKNESS * 2;

	const halfInnerW = innerWidth / 2;
	const halfInnerD = innerDepth / 2;
	const halfOuterW = outerWidth / 2;
	const halfOuterD = outerDepth / 2;
	// Side slab lengths
	const sideLength = innerDepth + FRAME_THICKNESS * 2; // left/right span full outer depth
	const topBottomLength = innerWidth; // top/bottom span only inner width (corners covered by sides)
	const yMid = FRAME_LIFT + FRAME_DEPTH / 2;

	const material = (
		<meshStandardMaterial
			map={diffuse}
			normalMap={normal}
			roughnessMap={roughness}
			aoMap={ao}
			roughness={0.82}
			metalness={0}
		/>
	);

	return (
		<group>
			{/* Left slab */}
			<mesh
				castShadow
				receiveShadow
				position={[-(halfInnerW + FRAME_THICKNESS / 2), yMid, 0]}
			>
				<boxGeometry args={[FRAME_THICKNESS, FRAME_DEPTH, sideLength]} />
				{material}
			</mesh>
			{/* Right slab */}
			<mesh
				castShadow
				receiveShadow
				position={[halfInnerW + FRAME_THICKNESS / 2, yMid, 0]}
			>
				<boxGeometry args={[FRAME_THICKNESS, FRAME_DEPTH, sideLength]} />
				{material}
			</mesh>
			{/* Top slab (back) */}
			<mesh
				castShadow
				receiveShadow
				position={[0, yMid, -(halfInnerD + FRAME_THICKNESS / 2)]}
			>
				<boxGeometry args={[topBottomLength, FRAME_DEPTH, FRAME_THICKNESS]} />
				{material}
			</mesh>
			{/* Bottom slab (front) */}
			<mesh
				castShadow
				receiveShadow
				position={[0, yMid, halfInnerD + FRAME_THICKNESS / 2]}
			>
				<boxGeometry args={[topBottomLength, FRAME_DEPTH, FRAME_THICKNESS]} />
				{material}
			</mesh>
			{/* Subtle dark edge inset to suggest a bezel lip */}
			<mesh
				position={[0, FRAME_LIFT + FRAME_DEPTH + 0.001, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
			>
				<ringGeometry
					args={[
						Math.min(halfInnerW, halfInnerD),
						Math.min(halfOuterW, halfOuterD),
						64,
						1,
						0,
						Math.PI * 2,
					]}
				/>
				<meshBasicMaterial
					color={tokens.ink.primary}
					transparent
					opacity={0.18}
					side={THREE.DoubleSide}
				/>
			</mesh>
		</group>
	);
}

import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import type { Color } from "@/engine";
import { ASSETS } from "@/utils/manifest";

interface Props {
	color: Color;
	level: number;
	worldX: number;
	worldZ: number;
}

/**
 * A single puck. The two player colours are textured with their
 * dedicated PBR sets — Wood008 (warm walnut) for red, Wood031
 * (light oak) for white. The wood is the identity.
 */
export function Piece({ color, level, worldX, worldZ }: Props) {
	const set = color === "red" ? ASSETS.pbr.redPiece : ASSETS.pbr.whitePiece;
	const { diffuse, normal, roughness } = useTexture({
		diffuse: set.diffuse,
		normal: set.normal,
		roughness: set.roughness,
	});

	useMemo(() => {
		for (const t of [diffuse, normal, roughness]) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.anisotropy = 8;
		}
		diffuse.colorSpace = THREE.SRGBColorSpace;
	}, [diffuse, normal, roughness]);

	const { puckRadius, puckHeight, puckGap } = tokens.board;
	const y = level * (puckHeight + puckGap) + puckHeight / 2;

	return (
		<mesh castShadow receiveShadow position={[worldX, y, worldZ]}>
			<cylinderGeometry args={[puckRadius, puckRadius, puckHeight, 48]} />
			<meshStandardMaterial
				map={diffuse}
				normalMap={normal}
				roughnessMap={roughness}
				roughness={0.7}
				metalness={0}
			/>
		</mesh>
	);
}

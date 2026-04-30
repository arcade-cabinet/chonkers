import { useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import type { Cell, Color } from "@/sim";
import { ASSETS } from "@/utils/manifest";
import { useCellClick } from "./CellClickContext";

interface Props {
	color: Color;
	level: number;
	worldX: number;
	worldZ: number;
	cell: Cell;
}

/**
 * A single puck. The two player colours are textured with their
 * dedicated PBR sets — Wood008 (warm walnut) for red, Wood031
 * (light oak) for white. The wood is the identity.
 *
 * Click handling: each puck routes its onClick through the
 * CellClickContext → PlayView's onCellClick. Stops propagation so
 * the cell-hitbox grid below the pieces doesn't double-fire.
 */
export function Piece({ color, level, worldX, worldZ, cell }: Props) {
	const set = color === "red" ? ASSETS.pbr.redPiece : ASSETS.pbr.whitePiece;
	const onCellClick = useCellClick();
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

	const handleClick = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		onCellClick(cell);
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: <mesh> is an R3F three.js node, not a DOM element. R3F pointer events are pre-projected via the canvas's a11y wiring (the canvas itself is reachable; the cell-click path lands on the broker's typed handler).
		<mesh
			castShadow
			receiveShadow
			position={[worldX, y, worldZ]}
			onClick={handleClick}
		>
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

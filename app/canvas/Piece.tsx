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
	/**
	 * True iff this piece is the TOP of its stack. Per RULES.md
	 * §4.3 the top piece's color controls the stack — players move
	 * stacks they control. Top pieces render an emissive ring at
	 * the puck's top edge in the controlling color so a 4-tall
	 * mixed stack reads unambiguously.
	 */
	isTop: boolean;
}

const TOP_CAP_INNER_FACTOR = 0.78;
const TOP_CAP_OUTER_FACTOR = 0.98;

/**
 * A single puck. The two player colours are textured with their
 * dedicated PBR sets — Wood008 (warm walnut) for red, Wood031
 * (light oak) for white. The wood is the identity.
 *
 * Click handling: each puck routes its onClick through the
 * CellClickContext → PlayView's onCellClick. Stops propagation so
 * the cell-hitbox grid below the pieces doesn't double-fire.
 *
 * Motion: pieces teleport between positions today. Animated
 * lift / arc / settle / chonk-impact lands in the beta-polish
 * pipeline (per the user's stage definition: alpha = game DONE,
 * polish = beta). The Match.lastMove trait is in place to drive
 * that animation when it ships.
 */
export function Piece({ color, level, worldX, worldZ, cell, isTop }: Props) {
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
	const capColor =
		color === "red" ? tokens.wood.pieceRed : tokens.wood.pieceWhite;

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
			{/*
			 * Top-cap ring — a thin emissive ring inset on the puck's
			 * top face that matches the controlling color. Hides on
			 * non-top pieces so the stack reads as "the topmost
			 * colored band controls".
			 */}
			{isTop ? (
				<mesh
					position={[0, puckHeight / 2 + 0.001, 0]}
					rotation={[-Math.PI / 2, 0, 0]}
				>
					<ringGeometry
						args={[
							puckRadius * TOP_CAP_INNER_FACTOR,
							puckRadius * TOP_CAP_OUTER_FACTOR,
							64,
							1,
						]}
					/>
					<meshStandardMaterial
						color={capColor}
						emissive={capColor}
						emissiveIntensity={0.55}
						toneMapped={false}
						transparent
						opacity={0.95}
						side={THREE.DoubleSide}
					/>
				</mesh>
			) : null}
		</mesh>
	);
}

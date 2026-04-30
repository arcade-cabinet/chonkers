/**
 * Invisible per-cell hitboxes for empty-cell clicks. When the user
 * has a stack selected and taps an adjacent empty cell, the click
 * needs a target — Pieces only catch clicks on existing stacks.
 *
 * One slim mesh per cell: invisible material, full cell footprint,
 * sits just above the wood surface. R3F's onClick fires per-mesh
 * with cell coords routed through CellClickContext.
 *
 * The grid is rendered last in Scene so it sits above everything
 * for click priority — but pieces' onClick uses stopPropagation
 * so a click on a stacked piece never reaches the hitbox below.
 */

import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import { BOARD_COLS, BOARD_ROWS, posToVector3 } from "@/sim";
import { useCellClick } from "./CellClickContext";

const HITBOX_LIFT = 0.005;
const HITBOX_HEIGHT = 0.01;

export function CellHitboxGrid() {
	const onCellClick = useCellClick();

	const cells = useMemo(() => {
		const out: Array<{ col: number; row: number; x: number; z: number }> = [];
		for (let r = 0; r < BOARD_ROWS; r++) {
			for (let c = 0; c < BOARD_COLS; c++) {
				const v = posToVector3({ col: c, row: r });
				out.push({ col: c, row: r, x: v.x, z: v.z });
			}
		}
		return out;
	}, []);

	return (
		<group>
			{cells.map(({ col, row, x, z }) => (
				// biome-ignore lint/a11y/noStaticElementInteractions: <mesh> is R3F three.js, not DOM — R3F a11y is on the parent canvas, this is the projected pointer pipeline.
				<mesh
					key={`${col}-${row}`}
					position={[x, HITBOX_LIFT + HITBOX_HEIGHT / 2, z]}
					onClick={(e: ThreeEvent<MouseEvent>) => {
						e.stopPropagation();
						onCellClick({ col, row });
					}}
				>
					<boxGeometry args={[0.96, HITBOX_HEIGHT, 0.96]} />
					<meshBasicMaterial transparent opacity={0} depthWrite={false} />
				</mesh>
			))}
		</group>
	);
}

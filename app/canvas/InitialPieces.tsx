import { useMemo } from "react";
import { createInitialState, posToVector3, unpackPositionKey } from "@/engine";
import { Piece } from "./Piece";

/**
 * Renders the 5-4-3 starting layout from the canonical initial state
 * (3D occupancy `Map<bigint, Piece>`). Used by the title-screen
 * scene; the in-game render path (which subscribes to the live state
 * store) lands alongside the visual-shell PRQ.
 */
export function InitialPieces() {
	const state = useMemo(() => createInitialState(), []);

	const pieces: Array<{
		key: string;
		color: "red" | "white";
		level: number;
		x: number;
		z: number;
	}> = [];
	for (const [key, piece] of state.board) {
		const { col, row, height } = unpackPositionKey(key);
		const v = posToVector3({ col, row });
		pieces.push({
			key: `${col}-${row}-${height}`,
			color: piece.color,
			level: height,
			x: v.x,
			z: v.z,
		});
	}

	return (
		<>
			{pieces.map((p) => (
				<Piece
					key={p.key}
					color={p.color}
					level={p.level}
					worldX={p.x}
					worldZ={p.z}
				/>
			))}
		</>
	);
}

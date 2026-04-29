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

	return (
		<>
			{Array.from(state.board.entries()).map(([key, piece]) => {
				const { col, row, height } = unpackPositionKey(key);
				const v = posToVector3({ col, row });
				return (
					<Piece
						key={`${col}-${row}-${height}`}
						color={piece.color}
						level={height}
						worldX={v.x}
						worldZ={v.z}
					/>
				);
			})}
		</>
	);
}

/**
 * Renders one Piece component per piece in the live match's board.
 * Subscribes to the koota Match trait so any move the broker
 * commits propagates here automatically via React reactivity.
 *
 * Falls back to the canonical 5-4-3 starting layout when no match
 * is active (title screen + spectator mode), so the board never
 * looks empty.
 */

import { useTrait } from "koota/react";
import { useMemo } from "react";
import { createInitialState, posToVector3, unpackPositionKey } from "@/engine";
import { Match } from "@/sim";
import { useWorldEntity } from "../hooks/useWorldEntity";
import { Piece } from "./Piece";

export function Pieces() {
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	const fallback = useMemo(() => createInitialState(), []);
	// `match.game` is the live engine state. PRQ-4 commit 3 will
	// replace this with primitive piece-level traits to seal the
	// engine/UI boundary; for now read directly so the rest of the
	// shell can be built end-to-end. Falls back to the canonical
	// initial layout when no match is active so the board renders
	// on the title screen too.
	const board = match?.game?.board ?? fallback.board;

	return (
		<>
			{Array.from(board.entries()).map(([key, piece]) => {
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

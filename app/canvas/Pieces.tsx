/**
 * Renders one Piece component per piece in the live match. Subscribes
 * to the koota Match trait via `useTrait` — any move the broker
 * commits flows through `MatchSnapshot.pieces` (a frozen primitive
 * array, NOT the live engine state) and re-renders.
 *
 * Falls back to the canonical 5-4-3 starting layout when no match
 * is active (title screen + spectator mode) so the board never reads
 * as empty behind the title scrim.
 */

import { useTrait } from "koota/react";
import { useMemo } from "react";
import { createInitialState, posToVector3 } from "@/engine";
import { Match, type PiecePlacement, piecesFromBoard } from "@/sim";
import { useWorldEntity } from "../hooks/useWorldEntity";
import { Piece } from "./Piece";

export function Pieces() {
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	// Fallback derives once from the canonical initial state so the
	// board shows the 5-4-3 layout even before a match starts.
	const fallback: ReadonlyArray<PiecePlacement> = useMemo(
		() => piecesFromBoard(createInitialState().board),
		[],
	);
	const pieces = match?.pieces ?? fallback;

	// Memoise the position derivation by `pieces` reference. Match
	// trait identity is stable until the broker commits a move, so
	// this avoids 24 Vector3 allocations per unrelated re-render.
	const placements = useMemo(
		() =>
			pieces.map((p) => {
				const v = posToVector3({ col: p.col, row: p.row });
				return { p, x: v.x, z: v.z } as const;
			}),
		[pieces],
	);

	return (
		<>
			{placements.map(({ p, x, z }) => (
				<Piece
					key={`${p.col}-${p.row}-${p.height}`}
					color={p.color}
					level={p.height}
					worldX={x}
					worldZ={z}
				/>
			))}
		</>
	);
}

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
import { FALLBACK_PIECES, Match, posToVector3 } from "@/sim";
import { useWorldEntity } from "../hooks/useWorldEntity";
import { Piece } from "./Piece";

export function Pieces() {
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	// FALLBACK_PIECES is a module-level frozen constant in `@/sim`
	// — derived once at module load, no per-mount allocation.
	const pieces = match?.pieces ?? FALLBACK_PIECES;

	// Memoise the position derivation by `pieces` reference. Match
	// trait identity is stable until the broker commits a move, so
	// this avoids 24 Vector3 allocations per unrelated re-render.
	// Also computes the max height per cell so each Piece knows
	// whether it is the TOP piece of its stack (controls per
	// RULES §4.3 — the top piece's color determines who can move
	// the stack).
	const placements = useMemo(() => {
		const maxAtCell = new Map<string, number>();
		for (const p of pieces) {
			const k = `${p.col},${p.row}`;
			const cur = maxAtCell.get(k) ?? -1;
			if (p.height > cur) maxAtCell.set(k, p.height);
		}
		return pieces.map((p) => {
			const v = posToVector3({ col: p.col, row: p.row });
			const isTop = maxAtCell.get(`${p.col},${p.row}`) === p.height;
			return { p, x: v.x, z: v.z, isTop } as const;
		});
	}, [pieces]);

	return (
		<>
			{placements.map(({ p, x, z, isTop }) => (
				<Piece
					key={`${p.col}-${p.row}-${p.height}`}
					color={p.color}
					level={p.height}
					worldX={x}
					worldZ={z}
					cell={{ col: p.col, row: p.row }}
					isTop={isTop}
				/>
			))}
		</>
	);
}

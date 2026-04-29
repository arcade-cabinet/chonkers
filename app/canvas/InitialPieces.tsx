import { useMemo } from "react";
import { cellToWorld } from "@/engine/coords";
import { createInitialState } from "@/engine/initialState";
import { Piece } from "./Piece";

/**
 * Renders the 5-4-3 starting layout from the canonical initial
 * state. Used by the title-screen scene; the in-game render path
 * (which subscribes to the live state store) lands in a follow-up
 * commit alongside the rules engine.
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
	state.board.forEach((column, col) => {
		column.forEach((stack, row) => {
			if (!stack) return;
			const { x, z } = cellToWorld({ col, row });
			stack.forEach((piece, level) => {
				pieces.push({
					key: `${col}-${row}-${level}`,
					color: piece.color,
					level,
					x,
					z,
				});
			});
		});
	});

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

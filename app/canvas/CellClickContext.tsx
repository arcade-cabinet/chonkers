/**
 * Click pipeline from R3F meshes (Pieces + cell hitbox grid) up to
 * PlayView's onCellClick handler. R3F doesn't propagate context
 * across the <Canvas> boundary by default — useThree's reconciler
 * lives in its own renderer — but a vanilla React.createContext
 * does work across the boundary as long as the Provider wraps
 * the <Canvas>. Pieces and the hitbox grid consume via useContext.
 */

import { createContext, useContext } from "react";
import type { Cell } from "@/sim";

export type CellClickHandler = (cell: Cell) => void;

const CellClickContext = createContext<CellClickHandler | null>(null);

export const CellClickProvider = CellClickContext.Provider;

export function useCellClick(): CellClickHandler {
	const handler = useContext(CellClickContext);
	if (!handler) {
		// Default no-op so canvas-only renders (storybook, isolated tests)
		// don't crash. The PlayView wrapper installs the real handler.
		return () => {};
	}
	return handler;
}

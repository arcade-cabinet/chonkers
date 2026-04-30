/**
 * Click + gesture pipeline from R3F meshes (Pieces, cell hitboxes,
 * bezel gesture surface) up to PlayView's handlers. R3F doesn't
 * propagate context across the <Canvas> boundary by default, but
 * vanilla React.createContext does work as long as the Provider
 * wraps the canvas.
 */

import { createContext, useContext } from "react";
import type { Cell } from "@/sim";

export interface CanvasHandlers {
	readonly onCellClick: (cell: Cell) => void;
	readonly onForfeit: () => void;
}

const CanvasHandlersContext = createContext<CanvasHandlers | null>(null);

export const CanvasHandlersProvider = CanvasHandlersContext.Provider;

const NOOP_HANDLERS: CanvasHandlers = {
	onCellClick: () => {},
	onForfeit: () => {},
};

export function useCanvasHandlers(): CanvasHandlers {
	return useContext(CanvasHandlersContext) ?? NOOP_HANDLERS;
}

// Backward-compat shim — existing call sites use useCellClick().
export function useCellClick(): (cell: Cell) => void {
	return useCanvasHandlers().onCellClick;
}

// Old name kept for files that haven't been updated yet.
export const CellClickProvider = CanvasHandlersProvider;

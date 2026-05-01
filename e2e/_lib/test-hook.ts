/**
 * Shared `window.__chonkers` testHook type. Imported by every e2e
 * spec so each can declare-merge the global Window interface from a
 * single source of truth — duplicate `declare global { interface
 * Window {} }` blocks across spec files trip TS2717 in tsc strict
 * mode (CI catches this even when local typecheck is more
 * forgiving).
 */

export interface ChonkersTestHook {
	readonly screen: string | null;
	readonly matchId: string | null;
	readonly turn: "red" | "white" | null;
	readonly winner: "red" | "white" | null;
	readonly plyCount: number;
	readonly humanColor: "red" | "white" | null;
	readonly aiThinking: boolean;
	readonly actions: {
		startNewMatch: (humanColor?: "red" | "white" | null) => void;
		stepTurn: () => void;
		quitMatch: () => void;
		setSelection: (
			cell: { readonly col: number; readonly row: number } | null,
		) => void;
	};
	readonly scene: {
		openSplitRadialAt: (col: number, row: number, height: number) => boolean;
		closeSplitRadial: () => void;
	};
}

declare global {
	interface Window {
		readonly __chonkers?: ChonkersTestHook;
	}
}

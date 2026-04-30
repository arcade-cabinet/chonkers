/**
 * Shared TypeScript declaration for the `?testHook=1` window
 * surface exposed by `app/boot/boot.ts` in DEV builds. Both the
 * smoke spec and the governor spec rely on the same shape; this
 * file is the single source of truth.
 *
 * The shape mirrors the assignment in app/boot/boot.ts exactly:
 * `actions` (sim actions), `audio` (audio bus), `state` (the
 * engine's GameState — not a derived projection), `matchId`,
 * and `world` (the koota World instance for advanced
 * introspection).
 */

declare global {
	interface Window {
		readonly __chonkers?: {
			readonly actions: {
				readonly newMatch: (input: {
					redProfile: string;
					whiteProfile: string;
					humanColor: "red" | "white" | null;
					coinFlipSeed?: string;
				}) => Promise<void>;
				readonly resumeMatch: (input: {
					matchId: string;
					humanColor: "red" | "white" | null;
				}) => Promise<void>;
				readonly quitMatch: () => Promise<void>;
				readonly setScreen: (screen: string) => void;
				readonly setSelection: (
					cell: { col: number; row: number } | null,
				) => void;
				readonly setSplitArm: (count: number) => void;
				readonly stepTurn: () => Promise<void>;
				readonly forfeit: () => Promise<void>;
				readonly findResumableMatch: () => Promise<string | null>;
			};
			readonly audio: {
				readonly play: (role: string) => void;
				readonly stop: (role: string) => void;
				readonly startAmbient: () => void;
				readonly stopAmbient: () => void;
			};
			/**
			 * The engine's live GameState, or null when no match is
			 * active. Carries `turn`, `winner`, `board` (the engine's
			 * Map<bigint, Piece>), `chain`, etc. — read it via the
			 * derived getters rather than mutating directly.
			 */
			readonly state: {
				readonly turn?: "red" | "white";
				readonly winner?: "red" | "white" | null;
				readonly board?: ReadonlyMap<unknown, unknown>;
				readonly chain?: unknown;
			} | null;
			readonly matchId: string | null;
			readonly world: unknown;
		};
	}
}

export {};

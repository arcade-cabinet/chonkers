/**
 * Shared TypeScript declaration for the `?testHook=1` window
 * surface exposed by app/boot/boot.ts in DEV builds. Both the
 * smoke spec and the governor spec rely on the same shape; this
 * file is the single source of truth.
 */

declare global {
	interface Window {
		readonly __chonkers?: {
			readonly actions: {
				readonly newMatch: (input: {
					redProfile: string;
					whiteProfile: string;
					humanColor: "red" | "white" | null;
				}) => Promise<void>;
				readonly quitMatch: () => Promise<void>;
				readonly setScreen: (screen: string) => void;
			};
			readonly state: {
				readonly board?: ReadonlyMap<unknown, unknown>;
				readonly turn?: "red" | "white";
				readonly winner?: "red" | "white" | null;
			} | null;
			readonly matchId: string | null;
		};
	}
}

export {};

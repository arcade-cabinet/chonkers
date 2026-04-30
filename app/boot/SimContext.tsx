/**
 * React context wiring for the sim layer.
 *
 * The boot sequence produces a `BootResult` (sim world + actions +
 * audio bus). This context exposes the actions + audio bus to any
 * descendant via `useSimActions()` / `useAudio()`. The koota world
 * is exposed via koota's own `WorldProvider` from `koota/react`.
 */

import { WorldProvider } from "koota/react";
import { createContext, type ReactNode, useContext } from "react";
import type { AudioBus } from "@/audio";
import type { SimActions } from "@/sim";
import type { BootResult } from "./boot";

interface SimContextValue {
	readonly actions: SimActions;
	readonly audio: AudioBus;
}

const SimContext = createContext<SimContextValue | null>(null);

export function SimProvider({
	boot,
	children,
}: {
	readonly boot: BootResult;
	readonly children: ReactNode;
}) {
	return (
		<WorldProvider world={boot.sim.world}>
			<SimContext.Provider value={{ actions: boot.actions, audio: boot.audio }}>
				{children}
			</SimContext.Provider>
		</WorldProvider>
	);
}

function useSimContext(): SimContextValue {
	const ctx = useContext(SimContext);
	if (!ctx) {
		throw new Error(
			"useSim* called outside <SimProvider>. Wrap your tree with SimProvider in app/main.tsx.",
		);
	}
	return ctx;
}

export function useSimActions(): SimActions {
	return useSimContext().actions;
}

export function useAudio(): AudioBus {
	return useSimContext().audio;
}

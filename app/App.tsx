/**
 * Top-level screen router. Reads the koota `Screen` trait and
 * picks the right view. Sim actions (`newMatch`, `quitMatch`,
 * `setScreen`, etc.) drive transitions.
 *
 * The Screen trait lives on the singleton "world entity" spawned
 * by `createSimWorld`. `useTrait` from koota/react re-runs this
 * component whenever Screen changes.
 */

import { useTrait } from "koota/react";
import { Screen, type ScreenKind } from "@/sim";
import { useWorldEntity } from "./hooks/useWorldEntity";
import { EndScreen } from "./screens/EndScreen";
import { LobbyView } from "./screens/LobbyView";
import { PauseView } from "./screens/PauseView";
import { PlayView } from "./screens/PlayView";

export function App() {
	const worldEntity = useWorldEntity();
	const screenTrait = useTrait(worldEntity, Screen);
	const screen: ScreenKind = screenTrait?.value ?? "lobby";

	switch (screen) {
		case "lobby":
			return <LobbyView />;
		case "play":
			return <PlayView />;
		case "win":
			return <EndScreen variant="win" />;
		case "lose":
			return <EndScreen variant="lose" />;
		case "spectator-result":
			return <EndScreen variant="spectator" />;
		case "paused":
			return <PauseView />;
	}
}

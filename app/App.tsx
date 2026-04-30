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
import { Scene } from "./canvas/Scene";
import { useWorldEntity } from "./hooks/useWorldEntity";
import { TitleScreen } from "./screens/TitleScreen";

export function App() {
	const worldEntity = useWorldEntity();
	const screenTrait = useTrait(worldEntity, Screen);
	const screen: ScreenKind = screenTrait?.value ?? "title";

	switch (screen) {
		case "title":
			return <TitleScreen />;
		case "play":
			return <PlayView />;
		case "win":
			return <WinView />;
		case "lose":
			return <LoseView />;
		case "spectator-result":
			return <SpectatorResultView />;
		case "paused":
			return <PauseView />;
		case "settings":
			return <SettingsView />;
	}
}

// PRQ-4 stub views — minimal placeholders that the subsequent
// commits in this PR will flesh out (real Radix screens, real
// R3F integration, real input pipeline). Keeping the screen
// router shape complete now means each follow-up commit lands
// a single screen at a time without touching the router.

function PlayView() {
	return <Scene />;
}

function WinView() {
	return <PlaceholderScreen label="You win" />;
}

function LoseView() {
	return <PlaceholderScreen label="You lose" />;
}

function SpectatorResultView() {
	// AI-vs-AI termination — the viewer wasn't either side, so the
	// label is neutral. PRQ-4 follow-up will show the winning
	// profile + final stack distribution + a "watch another"
	// button. For now the placeholder communicates "the demo ended".
	return <PlaceholderScreen label="Match complete" />;
}

function PauseView() {
	return <PlaceholderScreen label="Paused" />;
}

function SettingsView() {
	return <PlaceholderScreen label="Settings" />;
}

function PlaceholderScreen({ label }: { readonly label: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				height: "100vh",
				fontFamily: "var(--ck-font-display, serif)",
				fontSize: "3rem",
			}}
		>
			{label}
		</div>
	);
}

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
import { useSimActions } from "./boot";
import { useWorldEntity } from "./hooks/useWorldEntity";
import { EndScreen } from "./screens/EndScreen";
import { PlayView } from "./screens/PlayView";
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
			return <EndScreen variant="win" />;
		case "lose":
			return <EndScreen variant="lose" />;
		case "spectator-result":
			return <EndScreen variant="spectator" />;
		case "paused":
			return <PauseView />;
		case "settings":
			return <SettingsView />;
	}
}

function PauseView() {
	const actions = useSimActions();
	return (
		<PlaceholderScreen
			label="Paused"
			actionLabel="Resume"
			onAction={() => actions.setScreen("play")}
		/>
	);
}

function SettingsView() {
	const actions = useSimActions();
	return (
		<PlaceholderScreen
			label="Settings"
			actionLabel="Back"
			onAction={() => actions.setScreen("title")}
		/>
	);
}

function PlaceholderScreen({
	label,
	actionLabel,
	onAction,
}: {
	readonly label: string;
	readonly actionLabel: string;
	readonly onAction: () => void;
}) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 24,
				height: "100vh",
				fontFamily: "var(--ck-font-display, serif)",
			}}
		>
			<div style={{ fontSize: "3rem" }}>{label}</div>
			<button
				type="button"
				onClick={onAction}
				style={{
					padding: "10px 24px",
					fontSize: "1rem",
					borderRadius: 6,
					border: "1px solid #E8B83A",
					background: "transparent",
					color: "#F5EBD8",
					cursor: "pointer",
				}}
			>
				{actionLabel}
			</button>
		</div>
	);
}

/**
 * Solid render root for the branded centered overlays.
 *
 * Mounts into <div id="ui-root"> sibling to the <canvas>. Subscribes
 * to the scene's koota world via the bridge in `./stores/ui-store.ts`
 * and renders one of the overlay components based on the current
 * `Screen` trait. The 3D scene continues to own the canvas; this
 * layer only owns the menu chrome + persistent in-game hamburger.
 *
 * No three / gsap imports here — those are forbidden in app/ by
 * .claude/gates.json. The bridge is pure koota signals.
 */

import { Show } from "solid-js";
import { render } from "solid-js/web";
import { BezelHamburger } from "./overlays/BezelHamburger";
import { BoardA11yGrid } from "./overlays/BoardA11yGrid";
import { EndGame } from "./overlays/EndGame";
import { Lobby } from "./overlays/Lobby";
import { NewGameConfig } from "./overlays/NewGameConfig";
import { Pause } from "./overlays/Pause";
import { Settings } from "./overlays/Settings";
import { uiState } from "./stores/ui-store";

import "./styles.css";

function App() {
	return (
		<>
			<Show when={uiState.screen() === "title"}>
				<Lobby />
			</Show>
			<Show when={uiState.screen() === "play"}>
				<BezelHamburger />
			</Show>
			<BoardA11yGrid />

			<Show when={uiState.modal() === "new-game"}>
				<NewGameConfig />
			</Show>
			<Show when={uiState.modal() === "settings"}>
				<Settings />
			</Show>
			<Show when={uiState.modal() === "pause"}>
				<Pause />
			</Show>
			<Show
				when={
					uiState.screen() === "win" ||
					uiState.screen() === "lose" ||
					uiState.screen() === "spectator-result"
				}
			>
				<EndGame />
			</Show>
		</>
	);
}

const root = document.getElementById("ui-root");
if (root) {
	render(() => <App />, root);
}

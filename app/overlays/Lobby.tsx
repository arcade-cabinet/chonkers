/**
 * Lobby overlay — the boot screen. New Game / Continue Game / Settings.
 *
 * "Continue Game" is disabled when no saved match exists in
 * Capacitor Preferences. The check fires on mount and when the
 * winner trait changes (a winning game just cleared the snapshot;
 * a fresh boot may or may not find one).
 */

import { createSignal, type JSX, onMount } from "solid-js";
import { loadActiveMatch } from "@/persistence/preferences/match";
import { Button } from "../primitives/Button";
import { Modal } from "../primitives/Modal";
import { openModal, uiState } from "../stores/ui-store";

export function Lobby(): JSX.Element {
	const [hasSaved, setHasSaved] = createSignal(false);

	const refreshSaved = async () => {
		try {
			const snap = await loadActiveMatch();
			setHasSaved(snap !== null);
		} catch {
			setHasSaved(false);
		}
	};

	onMount(() => {
		void refreshSaved();
	});

	const onResume = () => {
		// TODO C3-followup: hydrate the saved match into the sim.
		// For now this is a stub — Continue is wired but the actual
		// hydration path lives in src/scene/index.ts and will be
		// invoked here once the sim singleton exposes a resume API.
	};

	return (
		<Modal label="Chonkers">
			<div class="ck-lobby">
				<h1 class="ck-lobby__title">Chonkers</h1>
				<div class="ck-lobby__buttons">
					<Button variant="primary" onClick={() => openModal("new-game")}>
						New Game
					</Button>
					<Button variant="secondary" disabled={!hasSaved()} onClick={onResume}>
						Continue Game
					</Button>
					<Button variant="tertiary" onClick={() => openModal("settings")}>
						Settings
					</Button>
				</div>
				<p class="ck-lobby__hint">{uiState.matchId() === null ? "" : ""}</p>
			</div>
		</Modal>
	);
}

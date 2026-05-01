/**
 * Lobby overlay — the boot screen. New Game / Continue Game / Settings.
 *
 * "Continue Game" is disabled when no saved match exists in
 * Capacitor Preferences. The check fires on mount and when the
 * winner trait changes (a winning game just cleared the snapshot;
 * a fresh boot may or may not find one).
 */

import { createSignal, type JSX, onMount } from "solid-js";
import {
	loadActiveMatch,
	restoreAiPair,
} from "@/persistence/preferences/match";
import { getSimSingleton } from "@/sim";
import { Button } from "../primitives/Button";
import { Modal } from "../primitives/Modal";
import { openModal } from "../stores/ui-store";

export function Lobby(): JSX.Element {
	const [hasSaved, setHasSaved] = createSignal(false);
	const { actions } = getSimSingleton();

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

	const onResume = async () => {
		const snap = await loadActiveMatch();
		if (!snap) return;
		const ai = restoreAiPair(snap);
		actions.resumeMatch({
			redProfile: snap.redProfile,
			whiteProfile: snap.whiteProfile,
			humanColor: snap.humanColor,
			coinFlipSeed: snap.coinFlipSeed,
			actions: snap.actions,
			ai,
		});
	};

	return (
		<Modal label="Chonkers">
			<div class="ck-lobby">
				<h1 class="ck-lobby__title">Chonkers</h1>
				<div class="ck-lobby__buttons">
					<Button variant="primary" onClick={() => openModal("new-game")}>
						New Game
					</Button>
					<Button
						variant="secondary"
						disabled={!hasSaved()}
						onClick={() => void onResume()}
					>
						Continue Game
					</Button>
					<Button variant="tertiary" onClick={() => openModal("settings")}>
						Settings
					</Button>
				</div>
			</div>
		</Modal>
	);
}

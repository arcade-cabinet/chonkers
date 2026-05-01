import type { JSX } from "solid-js";
import { getSimSingleton } from "@/sim";
import { Button } from "../primitives/Button";
import { Modal } from "../primitives/Modal";
import { closeModal, openModal } from "../stores/ui-store";

export function Pause(): JSX.Element {
	const { actions } = getSimSingleton();
	const onResume = () => closeModal();
	const onSettings = () => openModal("settings");
	const onQuit = () => {
		actions.quitMatch();
		closeModal();
	};
	return (
		<Modal label="Paused" onClose={closeModal}>
			<div class="ck-pause">
				<h2 class="ck-pause__title">Paused</h2>
				<div class="ck-pause__buttons">
					<Button variant="primary" onClick={onResume}>
						Resume
					</Button>
					<Button variant="secondary" onClick={onSettings}>
						Settings
					</Button>
					<Button variant="tertiary" onClick={onQuit}>
						Quit
					</Button>
				</div>
			</div>
		</Modal>
	);
}

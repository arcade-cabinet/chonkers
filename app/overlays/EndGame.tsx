import type { JSX } from "solid-js";
import { getSimSingleton } from "@/sim";
import { Button } from "../primitives/Button";
import { Modal } from "../primitives/Modal";
import { openModal, uiState } from "../stores/ui-store";

export function EndGame(): JSX.Element {
	const { actions } = getSimSingleton();
	const winner = uiState.winner;
	const onPlayAgain = () => {
		actions.quitMatch();
		openModal("new-game");
	};
	const onQuit = () => {
		actions.quitMatch();
	};
	return (
		<Modal label="Game over" onClose={onQuit}>
			<div class="ck-endgame">
				<h2 class="ck-endgame__title">
					{winner() === null
						? "Draw"
						: winner() === "red"
							? "Red wins"
							: "White wins"}
				</h2>
				<div class="ck-endgame__buttons">
					<Button variant="primary" onClick={onPlayAgain}>
						Play Again
					</Button>
					<Button variant="secondary" onClick={onQuit}>
						Quit
					</Button>
				</div>
			</div>
		</Modal>
	);
}

/**
 * New-game config — 4 cards: Easy / Medium / Hard / Pass-and-Play.
 *
 * Disposition is randomised per side at match-create time so two
 * consecutive same-difficulty matches feel different.
 */

import type { JSX } from "solid-js";
import type { ProfileKey } from "@/ai";
import { getSimSingleton } from "@/sim";
import { Card } from "../primitives/Card";
import { Modal } from "../primitives/Modal";
import { closeModal } from "../stores/ui-store";

const DISPOSITIONS = ["aggressive", "balanced", "defensive"] as const;

function pickProfile(difficulty: "easy" | "medium" | "hard"): ProfileKey {
	const idx = Math.floor(Math.random() * DISPOSITIONS.length);
	const disp = DISPOSITIONS[idx] ?? "balanced";
	return `${disp}-${difficulty}` as ProfileKey;
}

export function NewGameConfig(): JSX.Element {
	const { actions } = getSimSingleton();

	const startVsAi = (difficulty: "easy" | "medium" | "hard") => {
		actions.newMatch({
			redProfile: pickProfile(difficulty),
			whiteProfile: pickProfile(difficulty),
			humanColor: "red",
		});
		closeModal();
	};

	const startPaP = () => {
		actions.newMatch({
			redProfile: "balanced-medium",
			whiteProfile: "balanced-medium",
			humanColor: "both",
		});
		closeModal();
	};

	return (
		<Modal label="New Game" onClose={closeModal}>
			<div class="ck-new-game">
				<h2 class="ck-new-game__title">New Game</h2>
				<div class="ck-new-game__grid">
					<Card
						title="Easy"
						descriptor="Casual opponent for learning the chonking dynamics."
						onClick={() => startVsAi("easy")}
					/>
					<Card
						title="Medium"
						descriptor="A real game. The opponent thinks two moves ahead."
						onClick={() => startVsAi("medium")}
					/>
					<Card
						title="Hard"
						descriptor="Punishing. The opponent thinks four moves ahead."
						onClick={() => startVsAi("hard")}
					/>
					<Card
						title="Pass and Play"
						descriptor="Two players, one device. Pass it across the table when the board flips."
						onClick={startPaP}
					/>
				</div>
			</div>
		</Modal>
	);
}

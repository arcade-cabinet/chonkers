/**
 * UI store — Solid signals reflecting koota world state.
 *
 * The scene layer owns the koota world; the Solid layer subscribes
 * via `world.onChange(trait, ...)`. Each signal here is a thin
 * mirror of a koota trait — Solid components read the signals and
 * re-render reactively when the underlying trait changes.
 *
 * The `modal` signal is purely UI-layer state (which centered
 * overlay is open) — koota doesn't know about it. Modals are opened
 * by overlay components via `openModal(name)` and dismissed by
 * `closeModal()` or by ESC handling in the Modal primitive.
 */

import { createSignal } from "solid-js";
import {
	getSimSingleton,
	Match as MatchTrait,
	Screen,
	type ScreenKind,
} from "@/sim";

const { sim } = getSimSingleton();

const [screen, setScreen] = createSignal<ScreenKind | null>(
	sim.worldEntity.get(Screen)?.value ?? null,
);
const [matchId, setMatchId] = createSignal<string | null>(
	sim.handle?.matchId ?? null,
);
const [winner, setWinner] = createSignal<"red" | "white" | null>(
	sim.worldEntity.get(MatchTrait)?.winner ?? null,
);
const [humanColor, setHumanColor] = createSignal<
	"red" | "white" | "both" | null
>(
	(sim.worldEntity.get(MatchTrait)?.humanColor ?? null) as
		| "red"
		| "white"
		| "both"
		| null,
);

type ModalKind = "new-game" | "settings" | "pause" | null;
const [modal, setModal] = createSignal<ModalKind>(null);

// Subscribe to koota: every Screen / Match change syncs into the
// Solid signals. Solid handles re-render scheduling.
sim.world.onChange(Screen, () => {
	setScreen(sim.worldEntity.get(Screen)?.value ?? null);
});
sim.world.onChange(MatchTrait, () => {
	const m = sim.worldEntity.get(MatchTrait);
	setWinner(m?.winner ?? null);
	setMatchId(sim.handle?.matchId ?? null);
	setHumanColor((m?.humanColor ?? null) as "red" | "white" | "both" | null);
});

export const uiState = {
	screen,
	matchId,
	winner,
	humanColor,
	modal,
};

export function openModal(name: Exclude<ModalKind, null>): void {
	setModal(name);
}

export function closeModal(): void {
	setModal(null);
}

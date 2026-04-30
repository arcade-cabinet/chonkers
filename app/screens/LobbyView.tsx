/**
 * Lobby — the new title screen. The board sits flat in the bezel
 * (no tilt), two demo pieces (red + white) flank the center axle,
 * and bezel-inlaid play / fast-forward buttons inlaid in the front
 * slab. Tapping a demo piece OR the play button initiates the new-
 * match ceremony:
 *
 *   1. demo-clearing  — demo pieces lift off + fade out (~700ms)
 *   2. placing-first  — first player's pieces fly into opening
 *      positions one at a time (~120ms per piece, 12 pieces ~1.4s)
 *   3. placing-second — opponent's pieces fly in similarly
 *   4. coin-flip      — two-sided coin chip spins to settle on the
 *      first-mover color (~1.8s)
 *   5. settling       — board tilts to playable angle, lobby
 *      transitions to play screen (~250ms)
 *
 * Total ceremony budget: ~5 seconds. The persisted match is
 * created at the START of step 1 (broker.createMatch) so the
 * coin-flip seed lives in the matches row from the first
 * persisted instant — no race where a refresh mid-ceremony
 * loses the seed.
 *
 * The Resume button takes a different path:
 *   1. Read the resumable match handle
 *   2. Pieces fly in from their persisted positions (no coin flip
 *      — the prior turn is already known)
 *   3. Settle to playable
 */

import { Box } from "@radix-ui/themes";
import { useTrait } from "koota/react";
import { useCallback, useEffect, useState } from "react";
import {
	Ceremony,
	type Color,
	decideFirstPlayer,
	freshCoinFlipSeed,
} from "@/sim";
import { useSimActions } from "../boot";
import { CanvasHandlersProvider } from "../canvas/CellClickContext";
import { LobbyScene } from "../canvas/LobbyScene";
import { useWorldEntity } from "../hooks/useWorldEntity";

const PHASE_DEMO_CLEARING_MS = 720;
const PHASE_PLACING_FIRST_MS = 1500;
const PHASE_PLACING_SECOND_MS = 1500;
const PHASE_COIN_FLIP_MS = 1900;
const PHASE_SETTLING_MS = 280;

const DEFAULT_PROFILE = "balanced-easy" as const;
const DEFAULT_HUMAN_COLOR: Color = "red";

export function LobbyView() {
	const worldEntity = useWorldEntity();
	const ceremony = useTrait(worldEntity, Ceremony);
	const actions = useSimActions();
	const [resumableId, setResumableId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void actions.findResumableMatch().then((id) => {
			if (!cancelled) setResumableId(id);
		});
		return () => {
			cancelled = true;
		};
	}, [actions]);

	const isCeremonyActive = (ceremony?.phase ?? "idle") !== "idle";

	const startNewMatch = useCallback(async () => {
		if (isCeremonyActive) return;
		const seed = freshCoinFlipSeed();
		const firstPlayer = decideFirstPlayer(seed);
		const startedAtMs = performance.now();

		// Phase 1 — demo pieces clear off the board.
		actions.setCeremony({
			phase: "demo-clearing",
			firstPlayer,
			pieceProgress: 0,
			startedAtMs,
		});

		// Create the persisted match while demo pieces are clearing.
		// Pass the same seed so the coin-flip animation (later)
		// reflects the engine's first-player decision.
		await actions.newMatch({
			redProfile: DEFAULT_PROFILE,
			whiteProfile: DEFAULT_PROFILE,
			humanColor: DEFAULT_HUMAN_COLOR,
			coinFlipSeed: seed,
		});

		// newMatch flips Screen to "play" immediately; we override
		// back to "lobby" until the ceremony finishes so the lobby
		// stays mounted through the placement + flip animations.
		actions.setScreen("lobby");

		await wait(PHASE_DEMO_CLEARING_MS);

		// Phase 2 — first player's pieces fly in.
		actions.setCeremony({
			phase: "placing-first",
			firstPlayer,
			pieceProgress: 0,
			startedAtMs: performance.now(),
		});
		await wait(PHASE_PLACING_FIRST_MS);

		// Phase 3 — opponent's pieces fly in.
		actions.setCeremony({
			phase: "placing-second",
			firstPlayer,
			pieceProgress: 0,
			startedAtMs: performance.now(),
		});
		await wait(PHASE_PLACING_SECOND_MS);

		// Phase 4 — coin chip flips to first-player color.
		actions.setCeremony({
			phase: "coin-flip",
			firstPlayer,
			pieceProgress: 0,
			startedAtMs: performance.now(),
		});
		await wait(PHASE_COIN_FLIP_MS);

		// Phase 5 — board tilts to playable, transition to play.
		actions.setCeremony({
			phase: "settling",
			firstPlayer,
			pieceProgress: 0,
			startedAtMs: performance.now(),
		});
		await wait(PHASE_SETTLING_MS);
		actions.setCeremony({
			phase: "idle",
			firstPlayer,
			pieceProgress: 0,
			startedAtMs: 0,
		});
		actions.setScreen("play");
	}, [actions, isCeremonyActive]);

	const resumeMatch = useCallback(async () => {
		if (isCeremonyActive || !resumableId) return;
		try {
			// Replay persisted moves through the engine + restore
			// the on-turn AI's perf state. The action sets sim.handle,
			// syncs the Match trait, and flips Screen to "play".
			// humanColor mirrors the lobby's new-match default so
			// the resumed match has the same player perspective the
			// human had when they originally started it. (B1 will
			// persist the choice in preferences for true round-trip.)
			await actions.resumeMatch({
				matchId: resumableId,
				humanColor: DEFAULT_HUMAN_COLOR,
			});
		} catch (err) {
			console.error("[chonkers] resumeMatch failed", err);
		}
	}, [actions, isCeremonyActive, resumableId]);

	// During phases 2-5, swap LobbyScene for a "ceremony scene" that
	// renders the actual board content (Pieces revealed by progress,
	// CoinFlipChip during phase 4) instead of the demo pieces.
	return (
		<Box
			style={{
				position: "relative",
				width: "100vw",
				height: "100vh",
				overflow: "hidden",
			}}
		>
			<CanvasHandlersProvider
				value={{ onCellClick: () => {}, onForfeit: () => {} }}
			>
				<LobbyScene
					onPlay={() => void startNewMatch()}
					onResume={() => void resumeMatch()}
					canResume={resumableId !== null}
				/>
			</CanvasHandlersProvider>
		</Box>
	);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

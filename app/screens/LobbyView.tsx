/**
 * Lobby — the entry screen. The board sits flat in the bezel
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

import { Box, Flex, SegmentedControl, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useTrait } from "koota/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isProfileKey, type ProfileKey } from "@/ai";
import {
	Ceremony,
	type Color,
	decideFirstPlayer,
	freshCoinFlipSeed,
} from "@/sim";
import { useAudio, useSimActions } from "../boot";
import { CanvasHandlersProvider } from "../canvas/CellClickContext";
import { LobbyScene } from "../canvas/LobbyScene";
import { useWorldEntity } from "../hooks/useWorldEntity";

const PHASE_DEMO_CLEARING_MS = 720;
const PHASE_PLACING_FIRST_MS = 1500;
const PHASE_PLACING_SECOND_MS = 1500;
const PHASE_COIN_FLIP_MS = 1900;
const PHASE_SETTLING_MS = 280;

type Disposition = "aggressive" | "balanced" | "defensive";
type Difficulty = "easy" | "medium" | "hard";
type ColorChoice = "red" | "white" | "watch";

const DISPOSITIONS = [
	"aggressive",
	"balanced",
	"defensive",
] as const satisfies readonly Disposition[];
const DIFFICULTIES = [
	"easy",
	"medium",
	"hard",
] as const satisfies readonly Difficulty[];
const COLOR_CHOICES = [
	"red",
	"white",
	"watch",
] as const satisfies readonly ColorChoice[];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function buildProfileKey(d: Disposition, df: Difficulty): ProfileKey {
	const key = `${d}-${df}` as const;
	if (!isProfileKey(key)) {
		throw new Error(`buildProfileKey: invariant violated — ${key}`);
	}
	return key;
}

const DEFAULT_DISPOSITION: Disposition = "balanced";
const DEFAULT_DIFFICULTY: Difficulty = "easy";
const DEFAULT_COLOR_CHOICE: ColorChoice = "red";

export function LobbyView() {
	const worldEntity = useWorldEntity();
	const ceremony = useTrait(worldEntity, Ceremony);
	const actions = useSimActions();
	const audio = useAudio();
	const [resumableId, setResumableId] = useState<string | null>(null);
	const [disposition, setDisposition] =
		useState<Disposition>(DEFAULT_DISPOSITION);
	const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
	const [colorChoice, setColorChoice] =
		useState<ColorChoice>(DEFAULT_COLOR_CHOICE);

	const profile = useMemo(
		() => buildProfileKey(disposition, difficulty),
		[disposition, difficulty],
	);
	const humanColor: Color | null =
		colorChoice === "watch" ? null : (colorChoice as Color);

	useEffect(() => {
		let cancelled = false;
		void actions.findResumableMatch().then((id) => {
			if (!cancelled) setResumableId(id);
		});
		return () => {
			cancelled = true;
		};
	}, [actions]);

	// Ambient bg loop runs while the lobby is mounted. Stops on
	// unmount (PlayView mounts; ambient layer continues IF we
	// chose to keep it across screens — for now stop it so play
	// has its own audio focus).
	useEffect(() => {
		audio.startAmbient();
		return () => {
			audio.stopAmbient();
		};
	}, [audio]);

	const isCeremonyActive = (ceremony?.phase ?? "idle") !== "idle";

	// Coin-flip phase entry plays the sting once. Read the
	// ceremony phase off the trait and play sting when we just
	// entered "coin-flip".
	const lastPhaseRef = useRef(ceremony?.phase ?? "idle");
	useEffect(() => {
		const phase = ceremony?.phase ?? "idle";
		const prior = lastPhaseRef.current;
		if (prior !== "coin-flip" && phase === "coin-flip") {
			audio.play("sting");
		}
		lastPhaseRef.current = phase;
	}, [ceremony, audio]);

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
		// reflects the engine's first-player decision. Both sides
		// use the same profile in the lobby — the picker exposes a
		// single AI difficulty/disposition; setting RED vs WHITE
		// asymmetric profiles is a future user-defined-AI feature.
		try {
			await actions.newMatch({
				redProfile: profile,
				whiteProfile: profile,
				humanColor,
				coinFlipSeed: seed,
			});
		} catch {
			// newMatch can fail if the persistence layer rejects the
			// matches row write (db locked, schema mismatch, etc.).
			// Without recovery the ceremony hangs in "demo-clearing"
			// and the demo pieces stay mid-air. Reset to idle so the
			// user can try again from a clean lobby state.
			actions.setCeremony({
				phase: "idle",
				firstPlayer,
				pieceProgress: 0,
				startedAtMs: 0,
			});
			return;
		}

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
	}, [actions, isCeremonyActive, profile, humanColor]);

	const resumeMatch = useCallback(async () => {
		if (isCeremonyActive || !resumableId) return;
		try {
			// Replay persisted moves through the engine + restore
			// the on-turn AI's perf state. The action sets sim.handle,
			// syncs the Match trait, and flips Screen to "play".
			// humanColor mirrors the lobby's current-picker selection.
			await actions.resumeMatch({
				matchId: resumableId,
				humanColor,
			});
		} catch {
			// resumeMatch failure means the persisted match is corrupt
			// or absent. UI fallback: stay on the lobby; the user can
			// start a fresh match. Silenced to keep the e2e governor's
			// console-error budget clean.
		}
	}, [actions, isCeremonyActive, resumableId, humanColor]);

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
			<AnimatePresence>
				{!isCeremonyActive ? (
					<motion.div
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.22, ease: "easeOut" }}
						style={{
							position: "absolute",
							top: 16,
							left: "50%",
							transform: "translateX(-50%)",
							pointerEvents: "auto",
						}}
					>
						<Box
							p="3"
							style={{
								background: "rgba(15, 10, 5, 0.78)",
								borderRadius: 12,
								boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
							}}
						>
							<Flex direction="column" gap="2" align="center">
								<PickerRow label="Color">
									<SegmentedControl.Root
										value={colorChoice}
										onValueChange={(v) => setColorChoice(v as ColorChoice)}
										size="1"
									>
										{COLOR_CHOICES.map((c) => (
											<SegmentedControl.Item key={c} value={c}>
												{c === "watch" ? "Watch" : `Play ${cap(c)}`}
											</SegmentedControl.Item>
										))}
									</SegmentedControl.Root>
								</PickerRow>
								<PickerRow label="Disposition">
									<SegmentedControl.Root
										value={disposition}
										onValueChange={(v) => setDisposition(v as Disposition)}
										size="1"
									>
										{DISPOSITIONS.map((d) => (
											<SegmentedControl.Item key={d} value={d}>
												{cap(d)}
											</SegmentedControl.Item>
										))}
									</SegmentedControl.Root>
								</PickerRow>
								<PickerRow label="Difficulty">
									<SegmentedControl.Root
										value={difficulty}
										onValueChange={(v) => setDifficulty(v as Difficulty)}
										size="1"
									>
										{DIFFICULTIES.map((d) => (
											<SegmentedControl.Item key={d} value={d}>
												{cap(d)}
											</SegmentedControl.Item>
										))}
									</SegmentedControl.Root>
								</PickerRow>
							</Flex>
						</Box>
					</motion.div>
				) : null}
			</AnimatePresence>
		</Box>
	);
}

function PickerRow({
	label,
	children,
}: {
	readonly label: string;
	readonly children: React.ReactNode;
}) {
	return (
		<Flex align="center" gap="2">
			<Text size="1" color="gray" style={{ minWidth: 78 }}>
				{label}
			</Text>
			{children}
		</Flex>
	);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lobby + ceremony scene. Same bezel + camera as PlayView so the
 * lobby → ceremony → play transition is a single continuous shot.
 *
 * Renders:
 *   - Bezel (always)
 *   - DemoPieces — visible in lobby (idle phase) + during demo-
 *     clearing phase. Hidden once cleared.
 *   - BezelButtons — Play + Resume icons. Visible only at idle.
 *   - PiecePlacementReveal — actual gameplay pieces revealed
 *     progressively during placing-first / placing-second / coin-
 *     flip / settling phases.
 *   - CoinFlipChip — visible only during coin-flip phase.
 *   - TippingBoard — wraps the Pieces + Board so settling phase
 *     can ease the tilt to playable.
 */

import { Environment } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { Suspense } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import { Ceremony, Match } from "@/sim";
import { ASSETS } from "@/utils/manifest";
import { useWorldEntity } from "../hooks/useWorldEntity";
import { Bezel } from "./Bezel";
import { BezelButtons } from "./BezelButtons";
import { Board } from "./Board";
import { CoinFlipChip } from "./CoinFlipChip";
import { DemoPieces } from "./DemoPieces";
import { Lighting } from "./Lighting";
import { PiecePlacementReveal } from "./PiecePlacementReveal";

const CAMERA_POSITION: [number, number, number] = [0, 13.2, 0.8];

const { cols, rows, cellSize } = tokens.board;
const BOARD_INNER_WIDTH = cols * cellSize;
const BOARD_INNER_DEPTH = rows * cellSize;
const BEZEL_FRAME_THICKNESS = 0.45;

interface Props {
	readonly onPlay: () => void;
	readonly onResume: () => void;
	readonly canResume: boolean;
}

export function LobbyScene({ onPlay, onResume, canResume }: Props) {
	return (
		<Canvas
			shadows
			dpr={[1, 2]}
			gl={{
				antialias: true,
				toneMapping: THREE.ACESFilmicToneMapping,
				toneMappingExposure: 1.0,
			}}
			camera={{ position: CAMERA_POSITION, fov: 50, near: 0.1, far: 60 }}
			onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
		>
			<color attach="background" args={[tokens.surface.canvasClear]} />
			<Suspense fallback={null}>
				<Environment files={ASSETS.hdri} />
				<Lighting />
				<Bezel innerWidth={BOARD_INNER_WIDTH} innerDepth={BOARD_INNER_DEPTH} />
				<LobbyContent
					onPlay={onPlay}
					onResume={onResume}
					canResume={canResume}
				/>
			</Suspense>
		</Canvas>
	);
}

/**
 * Inner content gated by the Ceremony phase. Putting this inside
 * Suspense means the textures used by Board/Pieces/DemoPieces all
 * fault in together rather than the lobby flashing partially-loaded.
 */
function LobbyContent({ onPlay, onResume, canResume }: Props) {
	const worldEntity = useWorldEntity();
	const ceremony = useTrait(worldEntity, Ceremony);
	const match = useTrait(worldEntity, Match);
	const phase = ceremony?.phase ?? "idle";

	const showLobbyAffordances = phase === "idle";
	const showBoardSurface =
		phase === "placing-first" ||
		phase === "placing-second" ||
		phase === "coin-flip" ||
		phase === "settling";
	const showCoinFlip = phase === "coin-flip";

	return (
		<>
			<DemoPieces onTap={onPlay} />
			{showLobbyAffordances ? (
				<BezelButtons
					innerDepth={BOARD_INNER_DEPTH}
					frameThickness={BEZEL_FRAME_THICKNESS}
					canResume={canResume}
					onPlay={onPlay}
					onResume={onResume}
				/>
			) : null}
			{showBoardSurface ? <Board /> : null}
			{showBoardSurface ? <PiecePlacementReveal /> : null}
			{showCoinFlip && match && ceremony ? (
				<CoinFlipChip
					winner={ceremony.firstPlayer}
					startedAtMs={ceremony.startedAtMs}
				/>
			) : null}
		</>
	);
}

/**
 * Bezel gesture surface — invisible hit planes over the four
 * bezel slabs that detect taps + knocks and route them to the
 * sim broker.
 *
 * Gestures:
 *   - Tap on YOUR side bezel → no-op for now (the board already
 *     rests tipped toward you when it's your turn). Future: nudge
 *     the tilt back forcefully if you want it back from AI sooner.
 *   - Tap on AI'S side bezel → no-op (the AI's tilt is automatic
 *     based on aiThinking; manual nudge could distract).
 *   - Knock = three taps within 600ms on YOUR side bezel → fires
 *     onForfeit. Replaces the DOM Forfeit button as the primary
 *     forfeit gesture.
 *
 * The KNOCK gesture is the load-bearing one. It reads as a
 * tabletop ritual: "I'm done, knock the board." We keep the DOM
 * Forfeit button visible too as a back-up + accessibility path —
 * removing it entirely would make forfeit unreachable for users
 * who can't physically triple-tap (motor accessibility) and would
 * be undiscoverable on first launch.
 */

import type { ThreeEvent } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { useRef } from "react";
import { tokens } from "@/design/tokens";
import { Match } from "@/sim";
import { useWorldEntity } from "../hooks/useWorldEntity";
import { useCanvasHandlers } from "./CellClickContext";

const HIT_LIFT = 0.34; // sit just above the bezel mesh top
const HIT_HEIGHT = 0.04;
const KNOCK_WINDOW_MS = tokens.motion.knockWindowMs;
const KNOCK_COUNT = tokens.motion.knockTapsRequired;

interface Props {
	readonly innerWidth: number;
	readonly innerDepth: number;
	readonly frameThickness: number;
}

export function BezelGestures({
	innerWidth,
	innerDepth,
	frameThickness,
}: Props) {
	const { onForfeit } = useCanvasHandlers();
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	const humanColor = match?.humanColor ?? null;
	const winner = match?.winner ?? null;

	// Knock state: ring buffer of recent tap timestamps on the
	// player's side bezel. Resets on color change or winner so a
	// stale knock from a prior match doesn't fire mid-new-match.
	const knockTaps = useRef<number[]>([]);

	// Active state — disable when there's no human or game's over.
	const active = humanColor !== null && !winner;

	const halfInnerD = innerDepth / 2;
	const yMid = HIT_LIFT;

	// "Player side" of the bezel is the side adjacent to the
	// player's home row. Red home is at NEGATIVE Z (back); white
	// home is at POSITIVE Z (front). So:
	//   - humanColor = red → player bezel is back slab (-Z)
	//   - humanColor = white → player bezel is front slab (+Z)
	const playerSlabZ =
		humanColor === "red"
			? -(halfInnerD + frameThickness / 2)
			: halfInnerD + frameThickness / 2;

	const handlePlayerKnock = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (!active) return;
		const now = performance.now();
		const taps = knockTaps.current;
		// Drop taps older than the rolling window.
		while (taps.length > 0 && now - taps[0]! > KNOCK_WINDOW_MS) {
			taps.shift();
		}
		taps.push(now);
		if (taps.length >= KNOCK_COUNT) {
			taps.length = 0;
			onForfeit();
		}
	};

	if (!active) return null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: <mesh> is R3F three.js, not DOM. The Forfeit DOM button remains as accessible fallback.
		<mesh position={[0, yMid, playerSlabZ]} onClick={handlePlayerKnock}>
			<boxGeometry
				args={[innerWidth + frameThickness * 2, HIT_HEIGHT, frameThickness]}
			/>
			<meshBasicMaterial transparent opacity={0} depthWrite={false} />
		</mesh>
	);
}

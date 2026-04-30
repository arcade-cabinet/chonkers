/**
 * Axle-tip turn metaphor.
 *
 * Geometry: the board content sits on an imagined center axle
 * along the X-axis. Tilting around this axle DROPS one side
 * toward the camera and LIFTS the other. "Your side dropped
 * toward you" = "the board is in your hands" = your turn.
 * Tilting it BACK toward the opponent = passing the turn over.
 *
 * Forfeit = a knock-style triple-tap on your own bezel slab
 * (handled by Bezel, not here).
 *
 * Coordinate convention. After posToVector3:
 *   - row 0 (RED home) maps to negative Z → back of viewport
 *   - row 10 (WHITE home) maps to positive Z → front of viewport
 *
 * Three.js X-rotation around the board axle:
 *   - positive angle: +Z (white side, front of viewport) goes UP,
 *     -Z (red side, back of viewport) goes DOWN
 *   - negative angle: +Z (white) goes DOWN, -Z (red) goes UP
 *
 * So "drop the red side" = NEGATIVE-X-component bias on the angle's
 * Z direction... actually simpler: positive angle = drop red side.
 * Wait — yes:
 *   - rotateX(+θ) sends Z=+1 to (0, sin θ, cos θ) → up. Front (white)
 *     up. Back (red) down. So +θ DROPS red.
 *   - rotateX(-θ) DROPS white.
 *
 * Active side ("yours = dropped") mapping:
 *   - red is yours / red is thinking → board tips toward red →
 *     +TURN_TILT_DELTA bias.
 *   - white is yours / white is thinking → board tips toward white →
 *     -TURN_TILT_DELTA bias.
 *
 * Resting bias: BOARD_TILT_BASE is the playable-default — slight
 * tilt toward the HUMAN so their pieces sit closer/lower, AI
 * pieces are further/higher. The base is computed from humanColor
 * at mount; spectator (humanColor null) parks at zero with the
 * turn-side bias driving the only motion.
 */

import { useFrame } from "@react-three/fiber";
import { useTrait } from "koota/react";
import type { ReactNode } from "react";
import { useRef } from "react";
import type * as THREE from "three";
import { tokens } from "@/design/tokens";
import { AiThinking, Match } from "@/sim";
import { useWorldEntity } from "../hooks/useWorldEntity";

const BASE_TILT_MAGNITUDE = tokens.scene.baseTiltMagnitude;
const TURN_TILT_DELTA = tokens.scene.turnTiltDelta;
const TILT_RATE = tokens.motion.tippingLerpRate;

interface Props {
	readonly children: ReactNode;
	readonly position?: [number, number, number];
}

export function TippingBoard({ children, position = [0, 0.04, 0] }: Props) {
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	const aiThinking = useTrait(worldEntity, AiThinking);
	const groupRef = useRef<THREE.Group | null>(null);
	const angleRef = useRef(0);

	useFrame((_, delta) => {
		const g = groupRef.current;
		if (!g) return;
		const target = computeTargetAngle(
			match?.turn ?? "red",
			match?.humanColor ?? null,
			match?.winner ?? null,
			aiThinking?.value === true,
		);
		const t = 1 - Math.exp(-TILT_RATE * delta);
		angleRef.current += (target - angleRef.current) * t;
		g.rotation.x = angleRef.current;
	});

	return (
		<group ref={groupRef} position={position}>
			{children}
		</group>
	);
}

function computeTargetAngle(
	turn: "red" | "white",
	humanColor: "red" | "white" | null,
	winner: "red" | "white" | null,
	thinking: boolean,
): number {
	if (winner) {
		// Tilt toward the LOSER — that side "drops" as forfeit beat.
		return sideBias(winner === "red" ? "white" : "red", BASE_TILT_MAGNITUDE);
	}
	if (humanColor === null) {
		// Spectator: tilt toward whoever's on turn (or thinking).
		return sideBias(turn, BASE_TILT_MAGNITUDE);
	}
	// Resting bias: tilt toward the HUMAN by the base magnitude.
	const baseBias = sideBias(humanColor, BASE_TILT_MAGNITUDE);
	const aiColor = humanColor === "red" ? "white" : "red";
	const activeColor = thinking || turn !== humanColor ? aiColor : humanColor;
	// Layer a smaller "active player" bias on top of the resting
	// human-bias. When AI is active, this counter-acts the human-
	// bias by +TURN_TILT_DELTA — board visibly tips back across
	// the axle toward the AI without going past horizontal.
	const activeBias = sideBias(activeColor, TURN_TILT_DELTA);
	return baseBias + activeBias;
}

/**
 * Returns the X-axis rotation that DROPS the given color's side
 * by `magnitude` radians.
 *
 *   - red home → negative Z → drops on POSITIVE X-rotation
 *   - white home → positive Z → drops on NEGATIVE X-rotation
 */
function sideBias(color: "red" | "white", magnitude: number): number {
	return color === "red" ? +magnitude : -magnitude;
}

/**
 * Visual feedback for piece selection on the play surface.
 *
 * - SelectionRing: animated emissive halo at the selected cell.
 *   Pulses to draw the eye and confirm the click landed.
 * - ValidMoveMarkers: thin gradient rings at each adjacent cell that
 *   the selected stack could legally reach (engine validates on
 *   commit; the markers are an adjacency hint, not a legality
 *   gate). Animated subtle bob to read as "available targets".
 *
 * Both ride above the board surface (small Y lift) without
 * interfering with shadow-catching mesh planes underneath.
 */

import { useFrame } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import {
	adjacentCells,
	BOARD_COLS,
	BOARD_ROWS,
	Match,
	posToVector3,
	Selection,
} from "@/sim";
import { useWorldEntity } from "../hooks/useWorldEntity";

const isOnBoard = (c: { col: number; row: number }): boolean =>
	c.col >= 0 && c.col < BOARD_COLS && c.row >= 0 && c.row < BOARD_ROWS;

/**
 * Deterministic per-cell phase offset for the bob animation.
 * Hash of (col, row) into [0, 2π) so adjacent markers don't bob
 * in lockstep but the same cell always gets the same phase
 * across renders + sessions (replay-safe).
 */
function cellPhase(c: { col: number; row: number }): number {
	const h = (c.col * 73856093) ^ (c.row * 19349663);
	return ((h >>> 0) % 1000) * (Math.PI * 2) * 0.001;
}

const RING_LIFT = 0.012;
const SELECTION_RING_INNER = 0.34;
const SELECTION_RING_OUTER = 0.5;
const TARGET_RING_INNER = 0.18;
const TARGET_RING_OUTER = 0.32;

export function SelectionOverlay() {
	const worldEntity = useWorldEntity();
	const selection = useTrait(worldEntity, Selection);
	const match = useTrait(worldEntity, Match);

	const selectionPos = useMemo(() => {
		if (!selection?.cell) return null;
		return posToVector3(selection.cell);
	}, [selection]);

	const targetPositions = useMemo(() => {
		if (!selection?.cell) return [];
		return adjacentCells(selection.cell)
			.filter(isOnBoard)
			.map((c) => ({ cell: c, vec: posToVector3(c) }));
	}, [selection]);

	// Hide when no human turn (humanColor null → spectator AI-vs-AI;
	// non-matching turn → AI's move pending).
	const humanColor = match?.humanColor ?? null;
	const turn = match?.turn ?? "red";
	const showOverlay = humanColor !== null && humanColor === turn;

	if (!showOverlay || !selectionPos) return null;

	return (
		<>
			<SelectionRing position={[selectionPos.x, RING_LIFT, selectionPos.z]} />
			{targetPositions.map(({ cell, vec }) => (
				<TargetMarker
					key={`${cell.col}-${cell.row}`}
					position={[vec.x, RING_LIFT, vec.z]}
					phase={cellPhase(cell)}
				/>
			))}
		</>
	);
}

function SelectionRing({ position }: { position: [number, number, number] }) {
	const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

	useFrame((_, delta) => {
		const mat = matRef.current;
		if (!mat) return;
		// Smooth pulse: emissiveIntensity oscillates ~0.6..1.4 over ~1.4s.
		const t = (mat.userData.t ?? 0) + delta;
		mat.userData.t = t;
		mat.emissiveIntensity = 1.0 + 0.4 * Math.sin(t * 4.4);
	});

	return (
		<mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
			<ringGeometry
				args={[SELECTION_RING_INNER, SELECTION_RING_OUTER, 64, 1]}
			/>
			<meshStandardMaterial
				ref={matRef}
				color={tokens.accent.select}
				emissive={tokens.accent.select}
				emissiveIntensity={1.0}
				toneMapped={false}
				transparent
				opacity={0.92}
				side={THREE.DoubleSide}
			/>
		</mesh>
	);
}

function TargetMarker({
	position,
	phase,
}: {
	position: [number, number, number];
	phase: number;
}) {
	const meshRef = useRef<THREE.Mesh | null>(null);
	const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

	useFrame((_, delta) => {
		const m = meshRef.current;
		const mat = matRef.current;
		if (!m || !mat) return;
		const t = (mat.userData.t ?? 0) + delta;
		mat.userData.t = t;
		const bob = Math.sin(t * 3.2 + phase);
		m.position.y = RING_LIFT + 0.018 * (0.5 + 0.5 * bob);
		mat.emissiveIntensity = 0.7 + 0.35 * (0.5 + 0.5 * bob);
	});

	return (
		<mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
			<ringGeometry args={[TARGET_RING_INNER, TARGET_RING_OUTER, 48, 1]} />
			<meshStandardMaterial
				ref={matRef}
				color={tokens.accent.select}
				emissive={tokens.accent.select}
				emissiveIntensity={0.7}
				toneMapped={false}
				transparent
				opacity={0.55}
				side={THREE.DoubleSide}
			/>
		</mesh>
	);
}

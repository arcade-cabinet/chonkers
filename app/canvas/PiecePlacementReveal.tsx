/**
 * Piece-placement reveal — the visible piece-by-piece flyin during
 * the new-match ceremony. Subscribes to Match.pieces (the persisted
 * 5-4-3 layout) + the Ceremony phase, and reveals pieces according
 * to the phase clock:
 *
 *   - placing-first  → first player's pieces fly in one at a time
 *   - placing-second → opponent's pieces fly in one at a time
 *   - coin-flip      → all pieces visible; coin chip is the focus
 *   - settling       → all pieces visible at rest
 *
 * Each piece arrives with an arc — starts ~3 units above its target
 * world position, falls and "settles" into place. Per-piece
 * staggered start times so the placements read as deliberate.
 *
 * Pieces are sorted before reveal: first player's home row pieces
 * first (so the player's side is set up before the opponent's).
 */

import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import {
	Ceremony,
	type CeremonyPhase,
	Match,
	type PiecePlacement,
	posToVector3,
} from "@/sim";
import { ASSETS } from "@/utils/manifest";
import { useWorldEntity } from "../hooks/useWorldEntity";

const PER_PIECE_STAGGER_MS = 105;
const PER_PIECE_FALL_MS = 380;
const ARC_HEIGHT = 3.4;

export function PiecePlacementReveal() {
	const worldEntity = useWorldEntity();
	const ceremony = useTrait(worldEntity, Ceremony);
	const match = useTrait(worldEntity, Match);

	const ordered = useMemo<{
		items: Array<{
			p: PiecePlacement;
			phase: "placing-first" | "placing-second";
		}>;
		boundary: number;
	}>(() => {
		if (!match || !ceremony) return { items: [], boundary: 0 };
		const first = ceremony.firstPlayer;
		const second = first === "red" ? "white" : "red";
		const firstPieces = match.pieces.filter((p) => p.color === first);
		const secondPieces = match.pieces.filter((p) => p.color === second);
		// boundary = index of the first placing-second piece. Computing
		// it once here keeps the per-piece staggerIndex calc O(1)
		// instead of O(n) per element (was O(n²) overall via findIndex
		// inside a map).
		return {
			items: [
				...firstPieces.map((p) => ({ p, phase: "placing-first" as const })),
				...secondPieces.map((p) => ({ p, phase: "placing-second" as const })),
			],
			boundary: firstPieces.length,
		};
	}, [match, ceremony]);

	if (!match || !ceremony) return null;

	return (
		<group>
			{ordered.items.map(({ p, phase }, i) => {
				const startedAtMs = ceremony.startedAtMs;
				const groupIndex = phase === "placing-first" ? i : i - ordered.boundary;
				return (
					<RevealedPiece
						key={`${p.col}-${p.row}-${p.height}-${p.color}`}
						placement={p}
						revealPhase={phase}
						currentPhase={ceremony.phase}
						startedAtMs={startedAtMs}
						staggerIndex={Math.max(0, groupIndex)}
					/>
				);
			})}
		</group>
	);
}

interface RevealedPieceProps {
	readonly placement: PiecePlacement;
	readonly revealPhase: "placing-first" | "placing-second";
	readonly currentPhase: CeremonyPhase;
	readonly startedAtMs: number;
	readonly staggerIndex: number;
}

function RevealedPiece({
	placement,
	revealPhase,
	currentPhase,
	startedAtMs,
	staggerIndex,
}: RevealedPieceProps) {
	const { puckRadius, puckHeight, puckGap } = tokens.board;
	const target = useMemo(() => posToVector3(placement), [placement]);
	const restY = placement.height * (puckHeight + puckGap) + puckHeight / 2;

	const set =
		placement.color === "red" ? ASSETS.pbr.redPiece : ASSETS.pbr.whitePiece;
	const tex = useTexture({
		diffuse: set.diffuse,
		normal: set.normal,
		roughness: set.roughness,
	});
	useMemo(() => {
		for (const t of [tex.diffuse, tex.normal, tex.roughness]) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.anisotropy = 8;
		}
		tex.diffuse.colorSpace = THREE.SRGBColorSpace;
	}, [tex]);

	const meshRef = useRef<THREE.Mesh | null>(null);

	useFrame(() => {
		const m = meshRef.current;
		if (!m) return;
		const visible = pieceVisibleAt(currentPhase, revealPhase);
		if (!visible) {
			m.visible = false;
			return;
		}
		m.visible = true;
		// If we're past the reveal's own phase, snap to rest.
		if (
			(revealPhase === "placing-first" && currentPhase !== "placing-first") ||
			(revealPhase === "placing-second" && currentPhase !== "placing-second")
		) {
			m.position.set(target.x, restY, target.z);
			return;
		}
		// During the reveal's phase, animate based on stagger + clock.
		const elapsed = performance.now() - startedAtMs;
		const localStart = staggerIndex * PER_PIECE_STAGGER_MS;
		const localElapsed = elapsed - localStart;
		if (localElapsed < 0) {
			m.visible = false;
			return;
		}
		m.visible = true;
		const tNorm = Math.min(1, localElapsed / PER_PIECE_FALL_MS);
		const eased = easeOutQuint(tNorm);
		const startY = restY + ARC_HEIGHT;
		m.position.x = target.x;
		m.position.z = target.z;
		m.position.y = startY + (restY - startY) * eased;
	});

	return (
		<mesh ref={meshRef} castShadow receiveShadow>
			<cylinderGeometry args={[puckRadius, puckRadius, puckHeight, 48]} />
			<meshStandardMaterial
				map={tex.diffuse}
				normalMap={tex.normal}
				roughnessMap={tex.roughness}
				roughness={0.7}
				metalness={0}
			/>
		</mesh>
	);
}

/**
 * A piece is visible if its reveal-phase has STARTED. First-player
 * pieces are visible during placing-first onward; second-player
 * pieces are visible during placing-second onward.
 */
function pieceVisibleAt(
	current: CeremonyPhase,
	reveal: "placing-first" | "placing-second",
): boolean {
	if (current === "placing-first") return reveal === "placing-first";
	if (
		current === "placing-second" ||
		current === "coin-flip" ||
		current === "settling"
	)
		return true;
	return false;
}

function easeOutQuint(t: number): number {
	const u = 1 - t;
	return 1 - u * u * u * u * u;
}

/**
 * Transient flying-piece overlay rendered on every committed move.
 * Subscribes to `Match.lastMove` — when that flips to a new
 * `(from, to)` pair, mounts a short-lived flying puck mesh that
 * travels from `from` to `to` along an arc with settle bob, and
 * applies a scale pulse on chonk landings (when the destination
 * had pieces before the commit).
 *
 * The underlying Pieces.tsx pucks teleport to their new positions
 * (their React keys include (col,row,height) so a move triggers
 * unmount/remount). The visible movement the eye reads comes from
 * THIS overlay — the actual pucks are only briefly visible at
 * their new positions before the overlay's arrival makes them
 * indistinguishable from "the puck that just landed."
 *
 * Timings come from `tokens.motion.{pieceLiftMs,pieceArcMs,
 * pieceSettleMs}` so rc fine-tuning happens through the design-
 * system surface.
 */

import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import { Match, type PiecePlacement, posToVector3 } from "@/sim";
import { ASSETS } from "@/utils/manifest";
import { useWorldEntity } from "../hooks/useWorldEntity";

const TRAVEL_DURATION_MS =
	tokens.motion.pieceLiftMs +
	tokens.motion.pieceArcMs +
	tokens.motion.pieceSettleMs;
const TRAVEL_ARC_HEIGHT = 1.4;
const CHONK_PULSE_SCALE = 0.18;
const CHONK_PULSE_WINDOW = 0.08;

interface ActiveAnimation {
	readonly id: number;
	readonly from: { col: number; row: number };
	readonly to: { col: number; row: number };
	readonly color: "red" | "white";
	readonly destPriorHeight: number;
	readonly startedAtMs: number;
}

let nextId = 0;

export function MoveAnimation() {
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	const [active, setActive] = useState<ActiveAnimation | null>(null);
	const priorPiecesRef = useRef<ReadonlyArray<PiecePlacement> | null>(null);
	const lastMoveSeenRef = useRef<{ from: unknown; to: unknown } | null>(null);

	useEffect(() => {
		if (!match) {
			priorPiecesRef.current = null;
			lastMoveSeenRef.current = null;
			return;
		}
		const lm = match.lastMove;
		if (!lm) {
			priorPiecesRef.current = match.pieces;
			return;
		}
		const seenKey = lastMoveSeenRef.current;
		const sameAsLast =
			seenKey !== null &&
			(seenKey.from as { col: number; row: number }).col === lm.from.col &&
			(seenKey.from as { col: number; row: number }).row === lm.from.row &&
			(seenKey.to as { col: number; row: number }).col === lm.to.col &&
			(seenKey.to as { col: number; row: number }).row === lm.to.row;
		if (sameAsLast) {
			priorPiecesRef.current = match.pieces;
			return;
		}
		lastMoveSeenRef.current = { from: lm.from, to: lm.to };

		// Color of the moved piece = the topmost piece at the
		// destination in the new snapshot (it's the piece that just
		// landed there).
		const destPieces = match.pieces.filter(
			(p) => p.col === lm.to.col && p.row === lm.to.row,
		);
		if (destPieces.length === 0) {
			priorPiecesRef.current = match.pieces;
			return;
		}
		const topAtDest = destPieces.reduce((max, p) =>
			p.height > max.height ? p : max,
		);

		// Destination's prior piece count = how tall it was before
		// the move. > 0 means we landed on existing pieces (chonk).
		const prior = priorPiecesRef.current ?? [];
		const destPriorHeight = prior.filter(
			(p) => p.col === lm.to.col && p.row === lm.to.row,
		).length;

		setActive({
			id: nextId++,
			from: lm.from,
			to: lm.to,
			color: topAtDest.color,
			destPriorHeight,
			startedAtMs: performance.now(),
		});

		priorPiecesRef.current = match.pieces;
	}, [match]);

	if (!active) return null;
	return <FlyingPiece anim={active} onDone={() => setActive(null)} />;
}

interface FlyingPieceProps {
	readonly anim: ActiveAnimation;
	readonly onDone: () => void;
}

function FlyingPiece({ anim, onDone }: FlyingPieceProps) {
	const set =
		anim.color === "red" ? ASSETS.pbr.redPiece : ASSETS.pbr.whitePiece;
	const { diffuse, normal, roughness } = useTexture({
		diffuse: set.diffuse,
		normal: set.normal,
		roughness: set.roughness,
	});
	useMemo(() => {
		for (const t of [diffuse, normal, roughness]) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.anisotropy = 8;
		}
		diffuse.colorSpace = THREE.SRGBColorSpace;
	}, [diffuse, normal, roughness]);

	const meshRef = useRef<THREE.Mesh | null>(null);
	const doneRef = useRef(false);

	const { puckRadius, puckHeight, puckGap } = tokens.board;
	const fromV = useMemo(() => posToVector3(anim.from), [anim.from]);
	const toV = useMemo(() => posToVector3(anim.to), [anim.to]);
	const restY = anim.destPriorHeight * (puckHeight + puckGap) + puckHeight / 2;

	useFrame(() => {
		const m = meshRef.current;
		if (!m) return;
		const elapsed = performance.now() - anim.startedAtMs;
		const tNorm = Math.min(1, elapsed / TRAVEL_DURATION_MS);
		const eased = easeInOutCubic(tNorm);
		const x = fromV.x + (toV.x - fromV.x) * eased;
		const z = fromV.z + (toV.z - fromV.z) * eased;
		const baseY = puckHeight / 2 + (restY - puckHeight / 2) * eased;
		const arcY = baseY + Math.sin(eased * Math.PI) * TRAVEL_ARC_HEIGHT;
		m.position.set(x, arcY, z);

		// Chonk impact pulse during the last 8% of travel when the
		// destination cell already had pieces. Reads as a "thump" of
		// the new piece settling onto the prior stack.
		if (tNorm > 1 - CHONK_PULSE_WINDOW && anim.destPriorHeight > 0) {
			const pulsePhase =
				(tNorm - (1 - CHONK_PULSE_WINDOW)) / CHONK_PULSE_WINDOW;
			const scale = 1 + Math.sin(pulsePhase * Math.PI) * CHONK_PULSE_SCALE;
			m.scale.set(scale, scale, scale);
		} else {
			m.scale.set(1, 1, 1);
		}

		if (tNorm >= 1 && !doneRef.current) {
			doneRef.current = true;
			onDone();
		}
	});

	return (
		<mesh ref={meshRef} castShadow receiveShadow>
			<cylinderGeometry args={[puckRadius, puckRadius, puckHeight, 48]} />
			<meshStandardMaterial
				map={diffuse}
				normalMap={normal}
				roughnessMap={roughness}
				roughness={0.7}
				metalness={0}
			/>
		</mesh>
	);
}

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

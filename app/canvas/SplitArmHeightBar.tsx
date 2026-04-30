/**
 * Vertical dot column rendered next to a selected stack to arm a
 * partial-stack split move (RULES.md §5).
 *
 * Each dot represents a sub-stack count from 1 .. stackHeight-1.
 * Tapping dot K sets `SplitArm.count` to K — the next destination
 * tap then commits a split move sending the top K pieces. Tapping
 * the same dot again clears the arm (back to full-stack mode).
 *
 * Visible only when:
 *   - the human controls the selected stack
 *   - the stack height is >= 2 (splits aren't meaningful for
 *     single-piece stacks)
 *
 * Position: floats just to the +X side of the selected cell, one
 * unit (~ a column) right of the stack so it doesn't occlude the
 * pieces. Each dot is `puckRadius * 0.4` and stacked at the same
 * Y heights as the puck-stack itself.
 */

import type { ThreeEvent } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { useMemo } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import { Match, posToVector3, Selection, SplitArm } from "@/sim";
import { useSimActions } from "../boot";
import { useWorldEntity } from "../hooks/useWorldEntity";

const DOT_OFFSET_X = 0.7;
const DOT_RADIUS_FACTOR = 0.42;

export function SplitArmHeightBar() {
	const worldEntity = useWorldEntity();
	const selection = useTrait(worldEntity, Selection);
	const match = useTrait(worldEntity, Match);
	const splitArm = useTrait(worldEntity, SplitArm);
	const actions = useSimActions();

	const { puckRadius, puckHeight, puckGap } = tokens.board;

	const stackPieces = useMemo(() => {
		if (!selection?.cell || !match) return null;
		const cell = selection.cell;
		const at = match.pieces.filter(
			(p) => p.col === cell.col && p.row === cell.row,
		);
		if (at.length === 0) return null;
		// Top piece's color controls (RULES §4.3).
		const topColor = at.reduce((max, p) =>
			p.height > max.height ? p : max,
		).color;
		return { count: at.length, topColor };
	}, [selection, match]);

	const humanColor = match?.humanColor ?? null;
	const turn = match?.turn ?? "red";
	const showWidget =
		humanColor !== null &&
		humanColor === turn &&
		stackPieces !== null &&
		stackPieces.topColor === humanColor &&
		stackPieces.count >= 2;

	if (!showWidget || !selection?.cell) return null;

	const v = posToVector3(selection.cell);
	const dotR = puckRadius * DOT_RADIUS_FACTOR;
	const armed = splitArm?.count ?? 0;

	const dots: Array<{ k: number; y: number }> = [];
	for (let k = 1; k <= stackPieces.count - 1; k += 1) {
		// Mirror the piece-stack heights: dot K sits at the height
		// of the piece that would be at stack-level (count-1-K)
		// when split off — i.e. just at the top of the stack
		// minus K-1 puck heights. Approximate with even spacing.
		const y = (k - 0.5) * (puckHeight + puckGap) + puckHeight / 2;
		dots.push({ k, y });
	}

	const handleDotTap =
		(k: number) =>
		(e: ThreeEvent<MouseEvent>): void => {
			e.stopPropagation();
			actions.setSplitArm(armed === k ? 0 : k);
		};

	return (
		<group position={[v.x + DOT_OFFSET_X, 0, v.z]}>
			{dots.map(({ k, y }) => {
				const isArmed = armed === k;
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: <mesh> is R3F three.js, not DOM. The split-arm action also reachable via the koota actions surface for keyboard / accessibility wrappers.
					<mesh
						key={k}
						position={[0, y, 0]}
						onClick={handleDotTap(k)}
						castShadow={false}
						receiveShadow={false}
					>
						<sphereGeometry args={[dotR, 24, 16]} />
						<meshStandardMaterial
							color={
								isArmed ? tokens.accent.split : tokens.splitRadial.idleStroke
							}
							emissive={isArmed ? tokens.accent.split : "#000000"}
							emissiveIntensity={isArmed ? 0.8 : 0}
							roughness={0.4}
							metalness={0}
							toneMapped={!isArmed}
							transparent
							opacity={isArmed ? 1 : 0.7}
							side={THREE.DoubleSide}
						/>
					</mesh>
				);
			})}
		</group>
	);
}

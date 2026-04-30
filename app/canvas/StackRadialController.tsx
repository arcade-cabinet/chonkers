/**
 * Live-stack radial controller — renders a RadialOverlay over the
 * currently-selected stack on the play screen, wired to the
 * SplitSelection sim trait + the broker's split actions.
 *
 * Lifecycle (per RULES.md §5):
 *   1. Player taps a stack of height ≥ 2 they control. PlayView's
 *      onCellClick sets `Selection.cell` to that cell.
 *   2. This controller mounts a RadialOverlay over that stack with
 *      H wedges. Each wedge tap calls `actions.toggleSplitSlice(i)`.
 *   3. Player presses + holds anywhere on the radial for 3000ms.
 *      A press-handler on the SVG container drives the hold timer;
 *      on fire, calls `actions.armSplitSelection()` + Haptic +
 *      audio.play("split").
 *   4. With armed === true, dragging beyond an 8px threshold begins
 *      drag-to-commit. `onCommit` projects the pointer's client
 *      coords to a board cell via raycaster + y=0 plane intersection
 *      and routes the cell through the same `onCellClick` path
 *      PlayView's tap pipeline uses — which reads splitSelection's
 *      indices to build the multi-run Action with `partitionRuns`.
 *
 * What's still NOT wired:
 *   - The dragged sub-stack visual following the pointer in 3D
 *     space (the spec says "selected slices detach into 3D pucks
 *     following the pointer"). Today the pointer drag commits
 *     immediately on threshold + release isn't required — the
 *     drag-direction defines the destination cell, not where the
 *     player happens to release. Future polish work.
 *   - Forced-chain auto-arm: when state.chain is active, the next
 *     detachment's slice indices should auto-populate
 *     SplitSelection so the chain owner just drags-to-commit on
 *     each turn. Today the human must manually re-tap the slices.
 */

import { useThree } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { useCallback, useMemo } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import {
	BOARD_COLS,
	BOARD_ROWS,
	Match,
	posToVector3,
	Selection,
	SplitSelection,
	vector3ToPos,
} from "@/sim";
import { useAudio, useSimActions } from "../boot";
import { useHaptics } from "../hooks/useHaptics";
import { useWorldEntity } from "../hooks/useWorldEntity";
import { useCanvasHandlers } from "./CellClickContext";
import { RadialOverlay } from "./RadialOverlay";

export function StackRadialController() {
	const worldEntity = useWorldEntity();
	const selection = useTrait(worldEntity, Selection);
	const match = useTrait(worldEntity, Match);
	const splitSelection = useTrait(worldEntity, SplitSelection);
	const actions = useSimActions();
	const audio = useAudio();
	const haptics = useHaptics();
	const { camera, gl } = useThree();
	const { onCellClick } = useCanvasHandlers();

	// Stable canonical key for the selection indices — joins to a
	// string so identity tracks content, not array reference. The
	// koota `useTrait` adapter returns a fresh snapshot reference on
	// every broker write (even no-op writes that produce identical
	// content), and `match.pieces` is replaced on every move. Without
	// these memos, `selectedSet` and the four callback props would
	// receive fresh identities on every parent render — a trap shape
	// that becomes a render-loop the moment any child memoises
	// against them. PRQ-A1 audit hazard H2.
	//
	// The memo reads ONLY the key string and reconstructs the Set
	// from it, so biome's useExhaustiveDependencies rule sees a
	// single-dep effect with no array-identity hazard.
	const indicesKey = (splitSelection?.indices ?? []).join(",");
	const selectedSet = useMemo<ReadonlySet<number>>(() => {
		if (indicesKey === "") return new Set<number>();
		return new Set<number>(indicesKey.split(",").map((s) => Number(s)));
	}, [indicesKey]);

	const handleSelectSlice = useCallback(
		(index: number) => {
			actions.toggleSplitSlice(index);
		},
		[actions],
	);
	const handleArm = useCallback(() => {
		actions.armSplitSelection();
		audio.play("split");
		haptics.chonk();
	}, [actions, audio, haptics]);
	const handleCommit = useCallback(
		({ clientX, clientY }: { clientX: number; clientY: number }) => {
			// Drag-to-commit hit-test (RULES §5.3). Convert pointer
			// coords → world ray → y=0 plane intersection → cell.
			const hitCell = cellAtClientPoint(clientX, clientY, camera, gl);
			if (!hitCell) return;
			if (
				hitCell.col < 0 ||
				hitCell.col >= BOARD_COLS ||
				hitCell.row < 0 ||
				hitCell.row >= BOARD_ROWS
			) {
				return;
			}
			onCellClick(hitCell);
		},
		[camera, gl, onCellClick],
	);

	if (!selection?.cell || !match) return null;
	// Cheap scalar guards FIRST — `match.pieces` is replaced on every
	// move so the component re-renders on every AI ply. Bail before
	// the O(N) filter when conditions can't be met. Audit polish for
	// the per-ply render-rate amplifier.
	const humanColor = match.humanColor;
	const isHumanTurn =
		humanColor !== null && match.turn === humanColor && !match.winner;
	if (!isHumanTurn) return null;
	const cell = selection.cell;
	const piecesAtCell = match.pieces.filter(
		(p) => p.col === cell.col && p.row === cell.row,
	);
	const stackHeight = piecesAtCell.length;
	if (stackHeight < 2) return null;
	// Top piece's color controls (RULES §4.3).
	const topPiece = piecesAtCell.reduce((max, p) =>
		p.height > max.height ? p : max,
	);
	if (topPiece.color !== humanColor) return null;

	// World-space anchor: top of the stack (top piece's center +
	// half its height + a tiny lift).
	const v = posToVector3(cell);
	const { puckHeight, puckGap } = tokens.board;
	const topY = topPiece.height * (puckHeight + puckGap) + puckHeight + 0.001;

	const armed = splitSelection?.armed ?? false;

	// `slotLabel` is fine inline — its identity changes only when
	// stackHeight changes, which already invalidates RadialOverlay's
	// internal `geom` useMemo, so a fresh closure here doesn't add
	// extra invalidation surface.
	return (
		<RadialOverlay
			position={[v.x, topY, v.z]}
			slices={stackHeight}
			selected={selectedSet}
			armed={armed}
			outerRadius={70}
			onSelectSlice={handleSelectSlice}
			slotLabel={(index) => `Slice ${index + 1} of ${stackHeight}`}
			onArm={handleArm}
			onCommit={handleCommit}
		/>
	);
}

// Module-scope reusable Three.js objects for `cellAtClientPoint`
// (PRQ-A1 audit hazard H4). The raycaster + plane + ndc + target
// have no per-call state worth preserving — `setFromCamera`
// overwrites the ray, `intersectPlane` writes to the supplied
// target. Reusing them avoids ~4 allocations per drag-commit.
// Pattern cited: https://discourse.threejs.org/t/performance-problem-when-using-raycaster/5314
const HIT_RAYCASTER = new THREE.Raycaster();
const HIT_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const HIT_NDC = new THREE.Vector2();
const HIT_TARGET = new THREE.Vector3();

/**
 * Project a client-space pointer position to a board cell.
 *
 * Builds an NDC vector from the canvas's bounding rect, raycasts
 * through the camera onto the y=0 plane (the board surface — pieces
 * sit ABOVE this plane and the radial overlay anchors above the
 * piece, but the destination-cell mapping uses the underlying
 * board grid), then snaps the intersection to the nearest cell via
 * the same `vector3ToPos` engine used by other hit-test paths.
 *
 * Returns null if the ray doesn't hit the plane (e.g., camera
 * pointing parallel to it, which can't happen in practice with the
 * tabletop-3/4 framing).
 */
function cellAtClientPoint(
	clientX: number,
	clientY: number,
	camera: THREE.Camera,
	gl: { domElement: HTMLCanvasElement },
): { col: number; row: number } | null {
	const rect = gl.domElement.getBoundingClientRect();
	HIT_NDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
	HIT_NDC.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
	HIT_RAYCASTER.setFromCamera(HIT_NDC, camera);
	const hit = HIT_RAYCASTER.ray.intersectPlane(HIT_PLANE, HIT_TARGET);
	if (!hit) return null;
	// vector3ToPos accepts any `{x, y, z}` shape — pass the
	// THREE.Vector3 directly (engine helpers are structural-typed).
	return vector3ToPos(HIT_TARGET);
}

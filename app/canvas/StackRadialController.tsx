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
import * as THREE from "three";
import { Vector3 } from "yuka";
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

	if (!selection?.cell || !match) return null;
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
	const humanColor = match.humanColor;
	const isHumanTurn =
		humanColor !== null && match.turn === humanColor && !match.winner;
	if (!isHumanTurn) return null;
	if (topPiece.color !== humanColor) return null;

	// World-space anchor: top of the stack (top piece's center +
	// half its height + a tiny lift).
	const v = posToVector3(cell);
	const { puckHeight, puckGap } = tokens.board;
	const topY = topPiece.height * (puckHeight + puckGap) + puckHeight + 0.001;

	const selectedSet = new Set<number>(splitSelection?.indices ?? []);
	const armed = splitSelection?.armed ?? false;

	return (
		<RadialOverlay
			position={[v.x, topY, v.z]}
			slices={stackHeight}
			selected={selectedSet}
			armed={armed}
			outerRadius={70}
			onSelectSlice={(index) => actions.toggleSplitSlice(index)}
			slotLabel={(index) => `Slice ${index + 1} of ${stackHeight}`}
			onArm={() => {
				actions.armSplitSelection();
				audio.play("split");
				haptics.chonk();
			}}
			onCommit={({ clientX, clientY }) => {
				// Drag-to-commit hit-test (RULES §5.3). Convert the
				// pointer's client coords to a ray in world space,
				// intersect the y=0 board plane, snap to the closest
				// cell, and route through the same onCellClick path
				// PlayView's tap pipeline uses (which reads
				// splitSelection.indices to build the multi-run action).
				const cell = cellAtClientPoint(clientX, clientY, camera, gl);
				if (!cell) return;
				if (
					cell.col < 0 ||
					cell.col >= BOARD_COLS ||
					cell.row < 0 ||
					cell.row >= BOARD_ROWS
				) {
					return;
				}
				onCellClick(cell);
			}}
		/>
	);
}

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
	const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
	const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const target = new THREE.Vector3();
	const hit = raycaster.ray.intersectPlane(plane, target);
	if (!hit) return null;
	return vector3ToPos(new Vector3(target.x, target.y, target.z));
}

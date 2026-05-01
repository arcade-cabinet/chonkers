/**
 * Input pipeline — raycaster against the board plane + piece meshes,
 * routed through the koota Selection trait and the sim broker's
 * commit action.
 *
 * Two interaction modes:
 *
 * 1. **Tap-to-select-and-move.** Tap a piece of the on-turn human's
 *    colour → set Selection. Tap a legal-move target with selection
 *    active → commit the full-stack move via `actions.commitHumanAction`.
 *    Tap elsewhere → clear.
 *
 * 2. **Drag-to-end-turn (the diegetic pivot gesture).** Pointer-down
 *    on empty board / bezel + drag toward the opponent past
 *    `END_TURN_DRAG_THRESHOLD_PX` while NO selection is active →
 *    end the human's turn. The board tips toward the opponent during
 *    the drag, and on commit the action dispatches `actions.stepTurn()`
 *    which hands control to the AI.
 *
 * Selection ring + valid-move markers are also owned here — they
 * live next to the selection state and the legal-action list.
 */

import gsap from "gsap";
import * as THREE from "three";
import { tokens } from "@/design";
import { type Action, enumerateLegalActions, type GameState } from "@/engine";
import type { SelectionSnapshot } from "@/sim/traits";

const END_TURN_DRAG_THRESHOLD_PX = 80;

export interface InputContext {
	readonly canvas: HTMLCanvasElement;
	readonly camera: THREE.PerspectiveCamera;
	readonly boardGroup: THREE.Object3D;
	readonly scene: THREE.Scene;
	readonly getGameState: () => GameState | null;
	readonly getSelection: () => SelectionSnapshot;
	readonly isHumanTurn: () => boolean;
	readonly humanColor: () => "red" | "white" | null;
	/**
	 * Color whose facing-direction drives the pivot-drag. Same as
	 * `humanColor` in vs-AI. In Pass-and-Play this is hard-coded to
	 * "red" so the screen-relative drag direction is constant
	 * regardless of which side is on turn (the device is physically
	 * re-oriented between turns via the 180° handoff).
	 */
	readonly humanFacingColor: () => "red" | "white" | null;
	readonly setSelection: (cell: { col: number; row: number } | null) => void;
	readonly commitAction: (action: Action) => void;
	readonly endHumanTurn: () => void;
}

export interface InputHandles {
	/**
	 * Refresh the selection-ring + valid-move-marker state from the
	 * latest selection + game state. Called by the scene's koota
	 * subscription whenever Selection or Match changes.
	 */
	refreshSelectionVisuals(): void;
	/**
	 * Programmatic cell tap. Same logic as a pointer-up on the board
	 * at the cell's screen coordinates (select own piece / commit move
	 * / clear selection). Used by the a11y board grid (PRQ-C3a) so
	 * keyboard + screen-reader users can drive the game without
	 * needing pixel-precise pointer aim.
	 */
	tapCell(cell: { col: number; row: number }): void;
	dispose(): void;
}

export function installInput(ctx: InputContext): InputHandles {
	const { canvas, camera, boardGroup, scene } = ctx;
	const { cols, rows, cellSize } = tokens.board;
	const halfX = (cols * cellSize) / 2 - cellSize / 2;
	const halfZ = (rows * cellSize) / 2 - cellSize / 2;

	const raycaster = new THREE.Raycaster();
	const pointerNdc = new THREE.Vector2();
	const planeHit = new THREE.Vector3();

	// Visuals — selection ring + valid-move markers — live ON the
	// board group so they tilt with the pivot.
	const visualsGroup = new THREE.Group();
	visualsGroup.name = "input-visuals";
	boardGroup.add(visualsGroup);

	const ringGeom = new THREE.RingGeometry(
		tokens.board.puckRadius * cellSize * 1.1,
		tokens.board.puckRadius * cellSize * 1.45,
		32,
	);
	ringGeom.rotateX(-Math.PI / 2);
	const ringMat = new THREE.MeshBasicMaterial({
		color: tokens.accent.select,
		transparent: true,
		opacity: 0.95,
		side: THREE.DoubleSide,
		depthTest: false,
		depthWrite: false,
	});
	const ring = new THREE.Mesh(ringGeom, ringMat);
	ring.renderOrder = 999;
	ring.visible = false;
	visualsGroup.add(ring);

	let pulseTimeline: gsap.core.Timeline | null = null;

	const markerGeom = new THREE.PlaneGeometry(cellSize * 0.85, cellSize * 0.85);
	markerGeom.rotateX(-Math.PI / 2);
	const markerMat = new THREE.MeshBasicMaterial({
		color: tokens.accent.select,
		transparent: true,
		opacity: 0.55,
		side: THREE.DoubleSide,
		depthTest: false,
		depthWrite: false,
	});
	const markers: THREE.Mesh[] = [];

	function clearMarkers(): void {
		for (const m of markers) visualsGroup.remove(m);
		markers.length = 0;
	}

	function placeRing(col: number, row: number): void {
		ring.position.set(-halfX + col * cellSize, 0.06, -halfZ + row * cellSize);
		ring.visible = true;
	}

	function placeMarker(col: number, row: number): void {
		const m = new THREE.Mesh(markerGeom, markerMat);
		m.position.set(-halfX + col * cellSize, 0.05, -halfZ + row * cellSize);
		m.renderOrder = 998;
		visualsGroup.add(m);
		markers.push(m);
	}

	function refreshSelectionVisuals(): void {
		const sel = ctx.getSelection();
		clearMarkers();
		if (pulseTimeline) {
			pulseTimeline.kill();
			pulseTimeline = null;
		}
		if (sel.cell === null) {
			ring.visible = false;
			return;
		}
		placeRing(sel.cell.col, sel.cell.row);
		pulseTimeline = gsap
			.timeline({ repeat: -1, yoyo: true })
			.to(ring.scale, {
				duration: 0.6,
				x: 1.12,
				y: 1.12,
				z: 1.12,
				ease: "sine.inOut",
			})
			.to(ringMat, { duration: 0.6, opacity: 0.55, ease: "sine.inOut" }, 0);
		const game = ctx.getGameState();
		if (!game) return;
		const allActions = enumerateLegalActions(game);
		const fromActions = allActions.filter(
			(a) => a.from.col === sel.cell?.col && a.from.row === sel.cell?.row,
		);
		const targetCells = new Set<string>();
		for (const a of fromActions) {
			for (const run of a.runs) {
				const key = `${run.to.col},${run.to.row}`;
				if (!targetCells.has(key)) {
					targetCells.add(key);
					placeMarker(run.to.col, run.to.row);
				}
			}
		}
	}

	function pointerToNdc(e: PointerEvent): void {
		const rect = canvas.getBoundingClientRect();
		pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	}

	/** Resolve the (col, row) under the pointer, or null if off-board. */
	function cellAtPointer(e: PointerEvent): { col: number; row: number } | null {
		pointerToNdc(e);
		raycaster.setFromCamera(pointerNdc, camera);
		// The board group is rotated by the pivot tween — the raycast
		// plane normal must match the rotated board's surface normal.
		const localNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(
			boardGroup.quaternion,
		);
		const dynamicPlane = new THREE.Plane(localNormal, 0);
		const hit = raycaster.ray.intersectPlane(dynamicPlane, planeHit);
		if (!hit) return null;
		// Convert worldspace hit → board-local coords (undo the boardGroup
		// rotation).
		const local = planeHit
			.clone()
			.applyQuaternion(boardGroup.quaternion.clone().invert());
		const col = Math.round((local.x + halfX) / cellSize);
		const row = Math.round((local.z + halfZ) / cellSize);
		if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
		return { col, row };
	}

	let dragStartY: number | null = null;
	let dragStartX: number | null = null;
	let dragActive = false;
	let dragSelectionAtStart: SelectionSnapshot["cell"] = null;

	function onPointerDown(e: PointerEvent): void {
		if (!ctx.isHumanTurn()) return;
		dragStartY = e.clientY;
		dragStartX = e.clientX;
		dragActive = false;
		dragSelectionAtStart = ctx.getSelection().cell;
		try {
			canvas.setPointerCapture?.(e.pointerId);
		} catch {
			// setPointerCapture throws in test environments where the
			// pointerId doesn't refer to an active hardware pointer.
			// Capture is a UX nicety for real pointers, not load-bearing.
		}
	}

	function humanFacingDirection(): 1 | -1 {
		// Red advances toward row+ ; white advances toward row-.
		// Diegetic turn-end gesture is "push the board away from
		// yourself" — drag UPWARD on screen for red (whose pieces are
		// at the back, looking toward white), drag DOWNWARD for white.
		return ctx.humanFacingColor() === "red" ? -1 : 1;
	}

	function onPointerMove(e: PointerEvent): void {
		if (dragStartY === null || dragStartX === null) return;
		if (dragSelectionAtStart !== null) return;
		const dy = e.clientY - dragStartY;
		const dx = e.clientX - dragStartX;
		if (Math.abs(dx) > Math.abs(dy) * 1.5) return;
		const facing = humanFacingDirection();
		const movement = -dy * facing;
		if (movement < 0) return;
		dragActive = true;
		const t = Math.min(1, movement / END_TURN_DRAG_THRESHOLD_PX);
		const restingTilt = -facing * tokens.scene.baseTiltMagnitude;
		const opponentTilt = facing * tokens.scene.baseTiltMagnitude;
		boardGroup.rotation.x = restingTilt + (opponentTilt - restingTilt) * t;
	}

	function onPointerUp(e: PointerEvent): void {
		const startY = dragStartY;
		const startX = dragStartX;
		dragStartY = null;
		dragStartX = null;
		try {
			canvas.releasePointerCapture?.(e.pointerId);
		} catch {
			// Same defense as setPointerCapture above.
		}

		if (startY === null || startX === null) return;

		if (dragActive) {
			const dy = e.clientY - startY;
			const facing = humanFacingDirection();
			const movement = -dy * facing;
			if (movement >= END_TURN_DRAG_THRESHOLD_PX) {
				ctx.endHumanTurn();
			} else {
				gsap.to(boardGroup.rotation, {
					duration: tokens.motion.boardTipMs / 1000,
					x: -facing * tokens.scene.baseTiltMagnitude,
					ease: "power2.out",
				});
			}
			dragActive = false;
			return;
		}

		const cell = cellAtPointer(e);
		if (!cell) {
			ctx.setSelection(null);
			return;
		}
		tapCell(cell);
	}

	/**
	 * Same logic as a pointer-up on a board cell — selection toggle +
	 * commit. Called by both the canvas pointer handler (with a cell
	 * derived from the raycast) and the a11y board grid (with a cell
	 * derived from the gridcell's aria-label).
	 */
	function tapCell(cell: { col: number; row: number }): void {
		if (!ctx.isHumanTurn()) return;
		const sel = ctx.getSelection();
		const game = ctx.getGameState();

		if (sel.cell === null) {
			if (!game) return;
			const top = topOf(game, cell.col, cell.row);
			if (top && top === ctx.humanColor()) {
				ctx.setSelection(cell);
			}
			return;
		}

		if (!game) return;
		const action = findCommittableAction(game, sel.cell, cell);
		if (action) {
			ctx.commitAction(action);
			ctx.setSelection(null);
		} else if (cell.col === sel.cell.col && cell.row === sel.cell.row) {
			ctx.setSelection(null);
		} else {
			const top = topOf(game, cell.col, cell.row);
			if (top && top === ctx.humanColor()) {
				ctx.setSelection(cell);
			} else {
				ctx.setSelection(null);
			}
		}
	}

	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerup", onPointerUp);
	canvas.addEventListener("pointercancel", onPointerUp);

	function dispose(): void {
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerup", onPointerUp);
		canvas.removeEventListener("pointercancel", onPointerUp);
		pulseTimeline?.kill();
		clearMarkers();
		ringGeom.dispose();
		ringMat.dispose();
		markerGeom.dispose();
		markerMat.dispose();
		boardGroup.remove(visualsGroup);
		void scene;
	}

	return { refreshSelectionVisuals, tapCell, dispose };
}

function topOf(
	game: GameState,
	col: number,
	row: number,
): "red" | "white" | null {
	let highest: { height: number; color: "red" | "white" } | null = null;
	for (const piece of game.board.values()) {
		if (piece.col !== col || piece.row !== row) continue;
		if (!highest || piece.height > highest.height) {
			highest = { height: piece.height, color: piece.color };
		}
	}
	return highest?.color ?? null;
}

function findCommittableAction(
	game: GameState,
	from: { col: number; row: number },
	to: { col: number; row: number },
): Action | null {
	const all = enumerateLegalActions(game);
	for (const action of all) {
		if (action.from.col !== from.col || action.from.row !== from.row) continue;
		// PRQ-T3+T4 commits FULL-STACK moves only — splits land in
		// PRQ-T5+T6 via the splitting radial. A full-stack action has
		// exactly one run that includes every slice of the source stack.
		if (action.runs.length !== 1) continue;
		const run = action.runs[0];
		if (!run) continue;
		if (run.to.col !== to.col || run.to.row !== to.row) continue;
		const sourceHeight = highestHeight(game, from.col, from.row);
		if (run.indices.length !== sourceHeight) continue;
		return action;
	}
	return null;
}

function highestHeight(game: GameState, col: number, row: number): number {
	let h = 0;
	for (const piece of game.board.values()) {
		if (piece.col === col && piece.row === row)
			h = Math.max(h, piece.height + 1);
	}
	return h;
}

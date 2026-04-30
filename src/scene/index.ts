/**
 * src/scene — three.js scene + gsap tweens + diegetic SVG overlays.
 *
 * Single application entry point. Mounts the three.js scene to
 * `#scene-canvas` and the diegetic UI overlay tree to `#overlay`,
 * both declared in the root `index.html`.
 *
 * PRQ-T1 landed renderer + camera + lighting + board.
 * PRQ-T2 added pieces.
 * PRQ-T3+T4 merged adds: sim-world bootstrap (KV-backed), koota
 * subscription, raycaster input, selection ring + valid-move
 * markers, gsap board-tip (the diegetic turn-end pivot), AI-turn
 * dispatch.
 *
 * Diegetic SVG UI surfaces (lobby Play/Resume, splitting radial,
 * pause, end-game) come in PRQ-T5+T6 / T7+T8.
 */

import * as THREE from "three";
import { tokens } from "@/design";
import {
	type Action,
	applyAction as applyEngineAction,
	type GameState,
} from "@/engine";
import {
	clearActiveMatch,
	saveActiveMatch,
	snapshotFromHandle,
} from "@/persistence";
import {
	AiThinking,
	FALLBACK_PIECES,
	Match,
	type PiecePlacement,
	Selection,
	type SelectionSnapshot,
} from "@/sim/traits";
import { buildSimActions, createSimWorld, type SimWorld } from "@/sim/world";
import { tweenBoardTip } from "./animations";
import { buildBoard } from "./board";
import { buildCamera, resizeCamera } from "./camera";
import { type InputHandles, installInput } from "./input";
import { installLighting } from "./lighting";
import { buildPieces, loadPieceMaterials } from "./pieces";

const canvas = document.getElementById("scene-canvas");
const overlay = document.getElementById("overlay");

if (!(canvas instanceof HTMLCanvasElement)) {
	throw new Error(
		'scene boot: <canvas id="scene-canvas"> missing from index.html',
	);
}
if (!(overlay instanceof HTMLDivElement)) {
	throw new Error('scene boot: <div id="overlay"> missing from index.html');
}

function fitCanvas(c: HTMLCanvasElement): void {
	const dpr = Math.min(window.devicePixelRatio, 2);
	c.width = c.clientWidth * dpr;
	c.height = c.clientHeight * dpr;
}

const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: true,
	powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(tokens.surface.canvasClear);

const camera = buildCamera(canvas);

await installLighting(scene, renderer);

const board = buildBoard();
scene.add(board.group);

const pieceMaterials = loadPieceMaterials();
const pieces = buildPieces(pieceMaterials);
// Pieces ride ON the board group so they tilt with the pivot.
board.group.add(pieces.group);

window.addEventListener("resize", () => {
	fitCanvas(canvas);
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
	resizeCamera(camera, canvas);
});
fitCanvas(canvas);
resizeCamera(camera, canvas);

// === Sim world bootstrap ===
const matchStartedAt = Date.now();
const humanColorForSnapshot: "red" | "white" | null = "red";

const sim: SimWorld = createSimWorld({
	onPlyCommit: async (handle) => {
		try {
			await saveActiveMatch(
				snapshotFromHandle(handle, humanColorForSnapshot, matchStartedAt),
			);
		} catch (err) {
			console.warn("[scene] saveActiveMatch failed", err);
		}
	},
	onMatchEnd: async () => {
		try {
			await clearActiveMatch();
		} catch (err) {
			console.warn("[scene] clearActiveMatch failed", err);
		}
	},
});

const actions = buildSimActions(sim)(sim.world);

actions.newMatch({
	redProfile: "balanced-medium",
	whiteProfile: "balanced-medium",
	humanColor: humanColorForSnapshot,
});

// === Subscriptions (poll-based; once per rAF). Each sub compares
// the latest snapshot against a cached prior and reacts on diff.
let priorPiecesSig = "";
let priorSelectionSig = "";
let priorTurn: "red" | "white" | null = null;

function piecesSignature(pcs: ReadonlyArray<PiecePlacement>): string {
	return pcs
		.map((p) => `${p.col}.${p.row}.${p.height}.${p.color}`)
		.sort()
		.join("|");
}

function selectionSignature(s: SelectionSnapshot): string {
	return s.cell ? `${s.cell.col},${s.cell.row}` : "";
}

const inputCtx: InputHandles = installInput({
	canvas,
	camera,
	boardGroup: board.group,
	scene,
	getGameState: (): GameState | null => sim.handle?.game ?? null,
	getSelection: (): SelectionSnapshot =>
		sim.worldEntity.get(Selection) ?? { cell: null },
	isHumanTurn: (): boolean => {
		const m = sim.worldEntity.get(Match);
		if (!m || m.humanColor === null) return false;
		const thinking = sim.worldEntity.get(AiThinking)?.value ?? false;
		return m.turn === m.humanColor && !thinking && m.winner === null;
	},
	humanColor: (): "red" | "white" | null =>
		sim.worldEntity.get(Match)?.humanColor ?? null,
	setSelection: (cell): void => {
		actions.setSelection(cell);
	},
	commitAction: (action: Action): void => {
		void commitHumanAction(action);
	},
	endHumanTurn: (): void => {
		void actions.stepTurn();
	},
});

async function commitHumanAction(action: Action): Promise<void> {
	const handle = sim.handle;
	if (!handle) return;
	// Apply locally; trait sync happens via rAF poll below; then the
	// AI takes its turn. PRQ-T5+T6 swaps in actions.commitHumanAction
	// (which already exists in world.ts) once split actions need
	// chain-aware handling — for now this fast path is sufficient.
	handle.game = applyEngineAction(handle.game, action);
	actions.setSelection(null);
	await actions.stepTurn();
}

let rafId = 0;
function tick(): void {
	rafId = requestAnimationFrame(tick);
	const match = sim.worldEntity.get(Match);
	const sel = sim.worldEntity.get(Selection) ?? { cell: null };
	const aiThinking = sim.worldEntity.get(AiThinking)?.value ?? false;

	if (match) {
		const sig = piecesSignature(match.pieces);
		if (sig !== priorPiecesSig) {
			priorPiecesSig = sig;
			pieces.sync(match.pieces);
			inputCtx.refreshSelectionVisuals();
		}
		if (match.turn !== priorTurn) {
			priorTurn = match.turn;
			const facing = match.turn === "red" ? -1 : 1;
			tweenBoardTip({ boardGroup: board.group, direction: facing });
			if (
				match.humanColor !== null &&
				match.turn !== match.humanColor &&
				!aiThinking &&
				match.winner === null
			) {
				void actions.stepTurn();
			}
		}
	} else if (priorPiecesSig === "") {
		pieces.sync(FALLBACK_PIECES);
		priorPiecesSig = "fallback";
	}

	const selSig = selectionSignature(sel);
	if (selSig !== priorSelectionSig) {
		priorSelectionSig = selSig;
		inputCtx.refreshSelectionVisuals();
	}

	renderer.render(scene, camera);
}

tick();

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		cancelAnimationFrame(rafId);
		inputCtx.dispose();
		pieces.dispose();
		renderer.dispose();
	});
}

/**
 * src/scene — three.js scene + gsap tweens + diegetic SVG overlays.
 *
 * Single application entry point. Mounts the three.js scene to
 * `#scene-canvas` and the diegetic UI overlay tree to `#overlay`,
 * both declared in the root `index.html`.
 *
 * PRQ-T1 lands the renderer + camera + lighting + board. Pieces,
 * input, animation factories, and overlays come in PRQ-T2..T7.
 */

import * as THREE from "three";
import { tokens } from "@/design";
import { FALLBACK_PIECES } from "@/sim/traits";
import { buildBoard } from "./board";
import { buildCamera, resizeCamera } from "./camera";
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
scene.add(pieces.group);

// PRQ-T2: render the canonical 5-4-3 starting layout from the engine
// directly. PRQ-T3 wires the koota Match.pieces subscription so the
// rendered state tracks the broker as plies resolve.
pieces.sync(FALLBACK_PIECES);

window.addEventListener("resize", () => {
	fitCanvas(canvas);
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
	resizeCamera(camera, canvas);
});
fitCanvas(canvas);
resizeCamera(camera, canvas);

let rafId = 0;
function tick(): void {
	rafId = requestAnimationFrame(tick);
	renderer.render(scene, camera);
}
tick();

// HMR cleanup so dev reloads don't leak GPU resources.
if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		cancelAnimationFrame(rafId);
		pieces.dispose();
		renderer.dispose();
	});
}

/**
 * Scene camera — the "sitting at the table" perspective.
 *
 * Camera position and field-of-view come from `tokens.scene.*`.
 * The board-tip toward the active player (gsap-driven X-axis tilt
 * on the board group) is implemented in animations.ts; this file
 * just owns the camera primitive itself.
 */

import * as THREE from "three";
import { tokens } from "@/design";

export function buildCamera(
	canvas: HTMLCanvasElement,
): THREE.PerspectiveCamera {
	// Hidden / zero-sized canvases (first mount, hidden parent) would
	// otherwise produce Infinity/NaN aspect and seed an invalid
	// projection matrix — fall back to 1 until `resizeCamera` runs.
	const w = canvas.clientWidth;
	const h = canvas.clientHeight;
	const aspect = w > 0 && h > 0 ? w / h : 1;
	const camera = new THREE.PerspectiveCamera(
		tokens.scene.cameraFov,
		aspect,
		tokens.scene.cameraNear,
		tokens.scene.cameraFar,
	);
	camera.position.set(
		tokens.scene.cameraX,
		tokens.scene.cameraY,
		tokens.scene.cameraZ,
	);
	camera.lookAt(0, 0, 0);
	return camera;
}

export function resizeCamera(
	camera: THREE.PerspectiveCamera,
	canvas: HTMLCanvasElement,
): void {
	const w = canvas.clientWidth;
	const h = canvas.clientHeight;
	if (w === 0 || h === 0) return;
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
}

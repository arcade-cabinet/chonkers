/**
 * src/scene — three.js scene + gsap tweens + diegetic SVG overlays.
 *
 * Single application entry point. Mounts the three.js scene to
 * `#scene-canvas` and the diegetic UI overlay tree to `#overlay`,
 * both declared in the root `index.html`.
 *
 * This file is the PRQ-T0 stub. PRQ-T1 lands the actual board +
 * camera + lighting; PRQ-T2 lands pieces; PRQ-T3 lands input;
 * PRQ-T4 lands gsap animation factories; PRQ-T5..T7 land the
 * diegetic UI surfaces (lobby / coinflip / split / pause / endgame).
 */

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

// PRQ-T0: stub. Real scene construction lands in PRQ-T1.
// Drawing a simple message so the page isn't blank during the
// rebuild's intermediate commits.
const ctx = canvas.getContext("2d");
if (ctx) {
	canvas.width = window.innerWidth * window.devicePixelRatio;
	canvas.height = window.innerHeight * window.devicePixelRatio;
	canvas.style.width = `${window.innerWidth}px`;
	canvas.style.height = `${window.innerHeight}px`;
	ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
	ctx.fillStyle = "#1a0f08";
	ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
	ctx.fillStyle = "#f5ebd8";
	ctx.font = "20px Lato, system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.fillText(
		"Chonkers — three.js shell rebuild in progress (PRQ-T0)",
		window.innerWidth / 2,
		window.innerHeight / 2,
	);
}

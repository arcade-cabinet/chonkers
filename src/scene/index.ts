/**
 * src/scene — three.js scene + gsap tweens + diegetic SVG overlays.
 *
 * Single application entry point. Mounts the three.js scene to
 * `#scene-canvas` and the diegetic UI overlay tree to `#overlay`,
 * both declared in the root `index.html`.
 *
 * Flow:
 *  - Boot: show lobby (demo pucks + Play/Resume radials). Screen=title.
 *  - Tap Play: actions.newMatch(), Screen flips to "play", board
 *    pieces sync, AI auto-dispatch on its turn.
 *  - Tap Resume: loadActiveMatch() → rebuild handle from snapshot,
 *    flip to "play".
 *  - In play: tap piece → select. Tap legal target → commit.
 *    Tap a stack height ≥ 2 → splitting radial opens on top puck.
 *    Hold a slice 3s → flash + arm. Drag past threshold → commit.
 *  - Pivot drag toward opponent → end turn (the diegetic gesture).
 *  - Triple-tap bezel → pause radial on centre cell.
 *  - Match end → end-game radial on the winning stack.
 *  - Audio dispatched on Match.lastMove + winner transitions.
 *  - Haptics on selection start, chonk landing, hold-arm.
 */

import * as THREE from "three";
import { getAudioBus } from "@/audio";
import { tokens } from "@/design";
import type { Action, Color, GameState } from "@/engine";
import {
	clearActiveMatch,
	saveActiveMatch,
	snapshotFromHandle,
} from "@/persistence";
import {
	BOARD_COLS,
	BOARD_ROWS,
	decideFirstPlayer,
	enumerateLegalActions,
	getSimSingleton,
	posToVector3,
	setSceneTapCell,
} from "@/sim";
import {
	boardProjection,
	cellIndex,
	clearBoardProjection,
} from "@/sim/board-projection";
import {
	AiThinking,
	type HumanColor,
	Match,
	type PiecePlacement,
	Screen,
	Selection,
	type SelectionSnapshot,
} from "@/sim/traits";
import { tweenBoardHandoff180, tweenBoardTip } from "./animations";
import { buildBoard } from "./board";
import { buildCamera, resizeCamera } from "./camera";
import { buildCoinFlip, type CoinFlipHandle } from "./coinFlip";
import { buildDemoPucks, type DemoPucksHandle } from "./demoPucks";
import { type InputHandles, installInput } from "./input";
import { installLighting } from "./lighting";
import { buildSplitRadial } from "./overlay/splitRadial";
import { buildPieces, loadPieceMaterials } from "./pieces";

function findCanvas(): HTMLCanvasElement {
	const c = document.getElementById("scene-canvas");
	if (!(c instanceof HTMLCanvasElement)) {
		throw new Error(
			'scene boot: <canvas id="scene-canvas"> missing from index.html',
		);
	}
	return c;
}
function findOverlay(): HTMLDivElement {
	const o = document.getElementById("overlay");
	if (!(o instanceof HTMLDivElement)) {
		throw new Error('scene boot: <div id="overlay"> missing from index.html');
	}
	return o;
}

const canvas: HTMLCanvasElement = findCanvas();
const overlay: HTMLDivElement = findOverlay();

// === Sim singleton bootstrap ===
// MUST happen synchronously before any `await` so the persistence
// hooks register before app/main.tsx can call getSimSingleton()
// hookless. Both modules race at boot per <script type="module">'s
// async load, so first-caller-wins. Scene's call comes first only
// if it lands here (top-of-module, no awaits) instead of after the
// installLighting await further down.
const matchStartedAtMs = Date.now();
{
	const { sim: bootSim } = getSimSingleton({
		onPlyCommit: async (handle) => {
			try {
				const m = bootSim.worldEntity.get(Match);
				await saveActiveMatch(
					snapshotFromHandle(handle, m?.humanColor ?? null, matchStartedAtMs),
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
	void bootSim;
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
board.group.add(pieces.group);

const demoPucks: DemoPucksHandle = buildDemoPucks(pieceMaterials);
board.group.add(demoPucks.group);

const coin: CoinFlipHandle = buildCoinFlip(pieceMaterials);
board.group.add(coin.group);

const onWindowResize = () => {
	fitCanvas(canvas);
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
	resizeCamera(camera, canvas);
};
window.addEventListener("resize", onWindowResize);
fitCanvas(canvas);
resizeCamera(camera, canvas);

// HMR teardown — Vite re-imports the module on edit; without this
// hook the prior resize listener (and the rAF loop scheduled below)
// stack on top of the new ones, leaking 60fps work per reload.
if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		window.removeEventListener("resize", onWindowResize);
		cancelAnimationFrame(rafId);
	});
}

// === Sim world bootstrap (no auto-newMatch — lobby first) ===
// Persistence hooks are registered by app/main.tsx (which initialises
// the singleton first; src/scene/index.ts's getSimSingleton call here
// is hookless and returns the cached instance).
const { sim, actions } = getSimSingleton();

// Audio bus — lazy init on first user interaction.
let audioReady = false;
async function ensureAudio(): Promise<void> {
	if (audioReady) return;
	try {
		await getAudioBus();
		audioReady = true;
	} catch (err) {
		console.warn("[scene] audio bus init failed", err);
	}
}
async function playSfx(role: import("@/audio").AudioRole): Promise<void> {
	try {
		const bus = await getAudioBus();
		bus.play(role);
	} catch {
		// Audio is best-effort; silent on failure.
	}
}

// === Subscriptions (poll-based; once per rAF). ===
let priorPiecesSig = "";
let priorSelectionSig = "";
let priorTurn: "red" | "white" | null = null;
let priorScreen: string | null = null;
let priorPlyCount = -1;
let priorWinner: Color | null | undefined;

/**
 * In player-vs-AI matches: true while the human has committed an
 * action but not yet performed the tip-board pivot gesture. Engine
 * state.turn has already flipped to the AI's colour, but the AI is
 * NOT dispatched until the human tips. Cleared by `endHumanTurn`.
 *
 * AI-vs-AI matches (humanColor === null) ignore this flag — the
 * broker auto-steps every turn end-to-end without waiting on a
 * physical gesture (the AI has no hands to tip with).
 */
let humanAwaitingPivot = false;

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
		const screen = sim.worldEntity.get(Screen)?.value;
		if (screen !== "play" || m.winner !== null || thinking) return false;
		// PaP: every turn is a human turn (the on-turn colour decides).
		if (m.humanColor === "both") return true;
		return m.turn === m.humanColor;
	},
	humanColor: (): Color | null => {
		const m = sim.worldEntity.get(Match);
		if (!m) return null;
		// PaP: ownership = whoever's on turn (both players are human,
		// just one holds the device).
		if (m.humanColor === "both") return m.turn;
		return m.humanColor;
	},
	humanFacingColor: (): Color | null => {
		const m = sim.worldEntity.get(Match);
		if (!m) return null;
		// PaP: in hotseat, BOTH humans push the board "away from
		// themselves" with the same UP-on-screen gesture — the device
		// has been physically picked up and re-oriented after each
		// 180° handoff. The screen-relative drag direction is constant.
		// Pin to red so input.ts's humanFacingDirection is consistent.
		if (m.humanColor === "both") return "red";
		return m.humanColor;
	},
	setSelection: (cell): void => {
		actions.setSelection(cell);
		if (cell !== null) {
			void playSelectionHaptic();
		}
	},
	commitAction: (action: Action): void => {
		void commitHumanAction(action);
	},
	enumerateLegalActions,
	endHumanTurn: (): void => {
		// Pivot-drag turn-end gesture.
		const wasAwaiting = humanAwaitingPivot;
		humanAwaitingPivot = false;
		const m = sim.worldEntity.get(Match);
		const isPap = m?.humanColor === "both";
		if (wasAwaiting) {
			if (isPap) {
				// Pass-and-Play: full 180° handoff so the next player
				// sees their orientation upright. No AI to dispatch.
				const tipDir: 1 | -1 = m?.turn === "red" ? -1 : 1;
				tweenBoardHandoff180({
					boardGroup: board.group,
					tipDirection: tipDir,
					onComplete: () => {
						// Mark the bezel's data-orientation so the e2e
						// spec can assert the rotation completed. The
						// scene exposes the bezel mesh via a DOM stand-
						// in (`.ck-bezel-anchor`) — see updateBezelDom().
						const turnNow = sim.worldEntity.get(Match)?.turn;
						if (turnNow) {
							document
								.querySelectorAll<HTMLElement>(".ck-bezel-anchor")
								.forEach((el) => {
									el.dataset.orientation = turnNow;
								});
						}
					},
				});
				return;
			}
			// vs-AI: short tip toward the new on-turn side.
			const facing = sim.handle?.game.turn === "red" ? -1 : 1;
			tweenBoardTip({ boardGroup: board.group, direction: facing });
		}
		// vs-AI flow: dispatch the AI. PaP never calls stepTurn (no AI).
		if (!isPap) {
			void actions.stepTurn();
		}
	},
});

// Bridge: the Solid BoardA11yGrid calls singleton.tapCell which is
// wired to the input layer's tapCell. Same logic as a canvas
// pointer-up at the cell's screen coords (selection toggle / commit).
setSceneTapCell((cell) => inputCtx.tapCell(cell));

async function playSelectionHaptic(): Promise<void> {
	try {
		const { Haptics } = await import("@capacitor/haptics");
		await Haptics.selectionStart();
	} catch {
		// Haptics unsupported — silent.
	}
}

async function playChonkHaptic(): Promise<void> {
	try {
		const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
		await Haptics.impact({ style: ImpactStyle.Heavy });
	} catch {
		// silent
	}
}

async function commitHumanAction(action: Action): Promise<void> {
	const handle = sim.handle;
	if (!handle) return;
	// Detect chonk pre-commit (destination has pieces before apply).
	const dest = action.runs[0]?.to;
	const wasChonk = dest
		? handle.game.board.has((BigInt(dest.col) << 16n) | BigInt(dest.row))
		: false;
	// Route through the broker so traits sync + persistence + screen
	// transitions all run uniformly. Bypassing with a local
	// applyAction left the koota Match trait stale → UI didn't update,
	// next turn's input picked the wrong piece, etc.
	await actions.commitHumanAction(action);
	if (wasChonk) void playChonkHaptic();
	// Per the diegetic-UI rule: the player does NOT auto-end their
	// turn. The engine has flipped state.turn (so the AI is on
	// "logical" turn) but the scene gates AI dispatch + board tip
	// behind the pivot-drag gesture. AI-vs-AI matches don't set this
	// flag (humanColor === null path).
	if (handle.game.winner === null) {
		humanAwaitingPivot = true;
	}
}

// === Splitting radial ===
const splitRadial = buildSplitRadial({
	host: overlay,
	camera,
	canvas,
	onArm: () => {
		void (async () => {
			try {
				const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
				await Haptics.impact({ style: ImpactStyle.Medium });
			} catch {
				// silent
			}
		})();
	},
	onCommit: (selectedSlices) => {
		void commitSplitFromSlices(selectedSlices);
	},
});

async function commitSplitFromSlices(
	selectedSlices: ReadonlyArray<number>,
): Promise<void> {
	const sel = sim.worldEntity.get(Selection)?.cell;
	const handle = sim.handle;
	if (!sel || !handle) return;
	// KNOWN LIMITATION (tracked for follow-up beta UI work): when the
	// chosen slice set has multiple legal destinations, this picks
	// the FIRST legal action that matches the indices instead of the
	// drop target the player dragged toward. The split radial does
	// not currently expose a release-cell to its onCommit callback
	// — fixing this needs the radial to track pointer-up location
	// against the rendered cell grid. Filed in `.agent-state/`.
	const all = enumerateLegalActions(handle.game);
	for (const action of all) {
		if (action.from.col !== sel.col || action.from.row !== sel.row) continue;
		// Numeric sort — default `.sort()` lexicographic order would
		// rank `[10, 2]` as `[10, 2]` (string compare) and falsely
		// mismatch a stack of height ≥ 10 against the selected
		// indices the radial sends as numbers.
		const cmp = (a: number, b: number) => a - b;
		const allIndices = action.runs.flatMap((r) => [...r.indices]).sort(cmp);
		const target = [...selectedSlices].sort(cmp);
		if (allIndices.length !== target.length) continue;
		let match = true;
		for (let i = 0; i < target.length; i += 1) {
			if (allIndices[i] !== target[i]) {
				match = false;
				break;
			}
		}
		if (match) {
			await commitHumanAction(action);
			return;
		}
	}
	// No match — silently no-op. The radial is already closed.
}

function refreshSplitRadial(): void {
	const sel = sim.worldEntity.get(Selection) ?? { cell: null };
	if (sel.cell === null) {
		if (splitRadial.isOpen) splitRadial.close();
		return;
	}
	const match = sim.worldEntity.get(Match);
	if (!match) {
		if (splitRadial.isOpen) splitRadial.close();
		return;
	}
	const stackHeight = countStackHeight(
		match.pieces,
		sel.cell.col,
		sel.cell.row,
	);
	if (stackHeight < 2) {
		if (splitRadial.isOpen) splitRadial.close();
		return;
	}
	const top = pieces.topPuckAt(sel.cell.col, sel.cell.row);
	if (!top) {
		if (splitRadial.isOpen) splitRadial.close();
		return;
	}
	splitRadial.open(top, stackHeight);
}

function countStackHeight(
	placements: ReadonlyArray<PiecePlacement>,
	col: number,
	row: number,
): number {
	let h = 0;
	for (const p of placements) {
		if (p.col === col && p.row === row) h = Math.max(h, p.height + 1);
	}
	return h;
}

async function startNewMatch(humanColor: HumanColor = "red"): Promise<void> {
	await ensureAudio();
	humanAwaitingPivot = false;
	actions.newMatch({
		redProfile: "balanced-medium",
		whiteProfile: "balanced-medium",
		humanColor,
	});
	const handle = sim.handle;
	if (handle) {
		const firstPlayer = decideFirstPlayer(handle.coinFlipSeed);
		await coin.flip(firstPlayer);
		coin.hide();
	}
	void playSfx("ambient");
	void (async () => {
		try {
			const bus = await getAudioBus();
			bus.startAmbient();
		} catch {
			// silent
		}
	})();
}

// PRQ-C3 + PRQ-C4: the lobby / pause / end-game surfaces moved out of
// the diegetic SVG layer entirely into the Solid branded overlays
// (app/overlays/{Lobby,Pause,EndGame}.tsx). The scene retains the
// demo-puck mesh visibility (decorative idle pucks while Screen ===
// "title") and dispatches the win/loss audio sting on Match.winner
// change. Everything else lives in app/.
function refreshLobby(): void {
	const screen = sim.worldEntity.get(Screen)?.value;
	demoPucks.group.visible = screen === "title";
}
refreshLobby();

let rafId = 0;
function tick(): void {
	rafId = requestAnimationFrame(tick);
	const match = sim.worldEntity.get(Match);
	const sel = sim.worldEntity.get(Selection) ?? { cell: null };
	const aiThinking = sim.worldEntity.get(AiThinking)?.value ?? false;
	const screen = sim.worldEntity.get(Screen)?.value;

	if (screen !== priorScreen) {
		priorScreen = screen ?? null;
		refreshLobby();
	}

	if (match) {
		const sig = piecesSignature(match.pieces);
		if (sig !== priorPiecesSig) {
			priorPiecesSig = sig;
			pieces.sync(match.pieces);
			inputCtx.refreshSelectionVisuals();
			refreshSplitRadial();
		}
		// Detect the very first turn of a fresh match (or a freshly
		// resumed one) — `priorTurn === null` means we haven't yet
		// reacted to any turn for the current match. Without this,
		// vs-AI matches where the AI wins the opening coin-flip
		// deadlock: the turn never "flips" because it starts on the
		// AI side, so the auto-dispatch branch below never fires.
		const isFirstTurn = priorTurn === null;
		if (isFirstTurn || match.turn !== priorTurn) {
			priorTurn = match.turn;
			// Three modes of turn-flip handling:
			//   - AI-vs-AI sim (humanColor === null): auto-tip every
			//     turn-flip + auto-dispatch the next ply.
			//   - vs-AI (humanColor === "red" | "white"): auto-tip +
			//     auto-dispatch when it's the AI's turn (covers both
			//     "AI just played, flip back to human" AND the opening
			//     case where the AI moves first). Human-side turn-end
			//     fires from endHumanTurn after the pivot gesture.
			//   - Pass-and-Play (humanColor === "both"): NEVER auto-tip
			//     here. The 180° handoff fires from endHumanTurn after
			//     the player's pivot gesture. No AI dispatch.
			const hc = match.humanColor;
			const isPap = hc === "both";
			const isSim = hc === null;
			const isAiTurn = !isPap && !isSim && match.turn !== hc;
			const isAiSideTurnEnd = !isPap && !isSim && match.turn === hc;
			if (isSim || isAiSideTurnEnd) {
				const facing = match.turn === "red" ? -1 : 1;
				tweenBoardTip({ boardGroup: board.group, direction: facing });
				if (isSim && !aiThinking && match.winner === null) {
					void actions.stepTurn();
				}
			} else if (isAiTurn && !aiThinking && match.winner === null) {
				// AI's turn in a vs-AI match (most commonly the opening
				// move when the AI won the coin-flip). No board tip
				// here — the human hasn't moved, so no pivot to
				// reverse. Just dispatch.
				void actions.stepTurn();
			}
		}
		// Audio dispatch on ply change.
		if (match.plyCount !== priorPlyCount) {
			if (priorPlyCount >= 0 && match.plyCount > priorPlyCount) {
				// A move just landed. Play "move" by default; chonk haptic
				// already fired in commitHumanAction for the human side.
				void playSfx("move");
			}
			priorPlyCount = match.plyCount;
		}
		// Winner change → end-game radial + sting.
		if (match.winner !== priorWinner) {
			if (match.winner !== null && priorWinner !== undefined) {
				void playSfx("sting");
				const humanColor = match.humanColor;
				if (humanColor === "red" || humanColor === "white") {
					void playSfx(humanColor === match.winner ? "win" : "lose");
				}
				// End-game overlay opens automatically from app/ when
				// Screen flips to "win" / "lose" / "spectator-result".
			}
			priorWinner = match.winner;
		}
	} else if (priorPiecesSig !== "") {
		// No active match — clear pieces so the lobby demo pucks own the
		// stage. (Don't render FALLBACK_PIECES; it was a placeholder for
		// the pre-lobby boot path that no longer exists.)
		pieces.sync([]);
		priorPiecesSig = "";
		// Reset turn-flip cache so the next match's opening turn
		// triggers the first-turn branch above (otherwise a restart
		// where the next match opens on the same colour wouldn't
		// dispatch the opening AI move).
		priorTurn = null;
		priorPlyCount = -1;
		priorWinner = undefined;
	}

	const selSig = selectionSignature(sel);
	if (selSig !== priorSelectionSig) {
		priorSelectionSig = selSig;
		inputCtx.refreshSelectionVisuals();
		refreshSplitRadial();
	}

	splitRadial.update();

	updateBoardProjection();

	renderer.render(scene, camera);
}

// Per-frame projection of every board cell's anchor into screen-space CSS
// pixels. Read by the Solid `BoardA11yGrid` component to position the
// invisible <button role="gridcell"> overlay that delegates clicks back
// to the input layer's selection path. See src/sim/board-projection.ts
// for the contract; PRQ-C3a for the why.
const projectionScratch = new THREE.Vector3();
const cellHalfX = (BOARD_COLS * tokens.board.cellSize) / 2;
const cellHalfZ = (BOARD_ROWS * tokens.board.cellSize) / 2;
const bezelHalfX = cellHalfX + tokens.bezel.frameThickness;
const bezelHalfZ = cellHalfZ + tokens.bezel.frameThickness;

// NOT re-entrant — uses a shared `projectionScratch` Vector3. Safe today
// because callers within a single `updateBoardProjection()` pass only run
// sequentially and consume the result into their own object before the
// next call mutates the scratch.
function projectLocalToScreen(
	localX: number,
	localY: number,
	localZ: number,
	rect: DOMRect,
): { x: number; y: number; offscreen: boolean } {
	projectionScratch.set(localX, localY, localZ);
	board.group.localToWorld(projectionScratch);
	projectionScratch.project(camera);
	const offscreen = projectionScratch.z >= 1 || projectionScratch.z <= -1;
	const x = (projectionScratch.x * 0.5 + 0.5) * rect.width + rect.left;
	const y = (projectionScratch.y * -0.5 + 0.5) * rect.height + rect.top;
	return { x, y, offscreen };
}

function updateBoardProjection(): void {
	const screen = sim.worldEntity.get(Screen)?.value;
	if (screen !== "play") {
		if (boardProjection.ready) clearBoardProjection();
		return;
	}
	const rect = canvas.getBoundingClientRect();
	for (let row = 0; row < BOARD_ROWS; row += 1) {
		for (let col = 0; col < BOARD_COLS; col += 1) {
			const local = posToVector3({ col, row });
			boardProjection.cells[cellIndex(col, row)] = projectLocalToScreen(
				local.x,
				local.y,
				local.z,
				rect,
			);
		}
	}
	// Bezel top-right corner in board-local coords: +X = right side
	// from red's POV, -Z = white's far edge. After 180° rotation
	// these flip relative to screen — that's exactly the point of
	// projecting per frame instead of pinning to viewport.
	boardProjection.bezelTopRight = projectLocalToScreen(
		bezelHalfX,
		0,
		-bezelHalfZ,
		rect,
	);
	boardProjection.frame += 1;
	boardProjection.ready = true;
}

tick();

// Dev-only debug + test-hook surface. Gated by import.meta.env.DEV
// AND ?testHook=1 query param so production builds strip this entire
// branch via tree-shake (verified in dist: 0 occurrences of
// __chonkers / __debug after `pnpm build`). The smoke + golden specs
// load `/chonkers/?testHook=1` and read window.__chonkers to
// introspect sim state.
if (typeof window !== "undefined" && import.meta.env.DEV) {
	const hasTestHookFlag = new URLSearchParams(window.location.search).has(
		"testHook",
	);
	if (hasTestHookFlag) {
		(window as unknown as { __chonkers: object }).__chonkers = {
			get screen(): string | null {
				return sim.worldEntity.get(Screen)?.value ?? null;
			},
			get matchId(): string | null {
				return sim.handle?.matchId ?? null;
			},
			get state(): GameState | null {
				return sim.handle?.game ?? null;
			},
			get plyCount(): number {
				return sim.worldEntity.get(Match)?.plyCount ?? -1;
			},
			get turn(): "red" | "white" | null {
				return sim.worldEntity.get(Match)?.turn ?? null;
			},
			get winner(): "red" | "white" | null {
				return sim.worldEntity.get(Match)?.winner ?? null;
			},
			get humanColor(): HumanColor {
				return sim.worldEntity.get(Match)?.humanColor ?? null;
			},
			get aiThinking(): boolean {
				return sim.worldEntity.get(AiThinking)?.value ?? false;
			},
			get pieces(): ReadonlyArray<PiecePlacement> {
				return sim.worldEntity.get(Match)?.pieces ?? [];
			},
			actions: {
				startNewMatch: (humanColor: HumanColor = "red") =>
					void startNewMatch(humanColor),
				stepTurn: () => void actions.stepTurn(),
				quitMatch: () => actions.quitMatch(),
				setSelection: (cell: { col: number; row: number } | null) =>
					actions.setSelection(cell),
			},
			scene: {
				openSplitRadialAt: (col: number, row: number, height: number) => {
					const top = pieces.topPuckAt(col, row);
					if (!top) return false;
					splitRadial.open(top, height);
					return true;
				},
				closeSplitRadial: () => splitRadial.close(),
			},
		};
	}
}

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		cancelAnimationFrame(rafId);
		inputCtx.dispose();
		pieces.dispose();
		demoPucks.dispose();
		coin.dispose();
		splitRadial.dispose();
		renderer.dispose();
	});
}

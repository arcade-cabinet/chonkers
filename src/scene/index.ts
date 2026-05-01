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
import {
	type Action,
	BOARD_COLS,
	BOARD_ROWS,
	type Color,
	enumerateLegalActions,
	type GameState,
	posToVector3,
} from "@/engine";
import {
	clearActiveMatch,
	saveActiveMatch,
	snapshotFromHandle,
} from "@/persistence";
import { decideFirstPlayer, getSimSingleton, setSceneTapCell } from "@/sim";
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
import {
	buildLobbyAffordances,
	type LobbyAffordanceHandle,
} from "./overlay/lobbyAffordances";
import type { MenuRadialHandle } from "./overlay/menuRadial";
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

window.addEventListener("resize", () => {
	fitCanvas(canvas);
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
	resizeCamera(camera, canvas);
});
fitCanvas(canvas);
resizeCamera(camera, canvas);

// === Sim world bootstrap (no auto-newMatch — lobby first) ===
const matchStartedAt = { current: Date.now() };
const humanColorForSnapshot: { current: HumanColor } = { current: null };

const { sim, actions } = getSimSingleton({
	onPlyCommit: async (handle) => {
		try {
			await saveActiveMatch(
				snapshotFromHandle(
					handle,
					humanColorForSnapshot.current,
					matchStartedAt.current,
				),
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
	// Find a legal action whose `from` matches selection AND whose
	// total `runs.flatMap(r => r.indices)` matches `selectedSlices`.
	const all = enumerateLegalActions(handle.game);
	for (const action of all) {
		if (action.from.col !== sel.col || action.from.row !== sel.row) continue;
		const allIndices = action.runs.flatMap((r) => [...r.indices]).sort();
		const target = [...selectedSlices].sort();
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

// === Lobby affordances ===
const lobby: LobbyAffordanceHandle = buildLobbyAffordances({
	host: overlay,
	camera,
	canvas,
});

async function startNewMatch(humanColor: HumanColor = "red"): Promise<void> {
	await ensureAudio();
	humanColorForSnapshot.current = humanColor;
	matchStartedAt.current = Date.now();
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

// PRQ-C3: resume hydration moved to a follow-up task (C3a). The
// Solid Lobby.tsx greys the Continue button when no snapshot exists;
// invoking it is currently a stub. The hydration code path here is
// removed pending a clean broker-actions wrapper.

function refreshLobby(): void {
	// PRQ-C3: the lobby surface moved out of the diegetic SVG layer
	// into the Solid branded overlay (`app/overlays/Lobby.tsx`). The
	// scene still owns the demo-puck visuals (decorative), but the
	// lobbyAffordances SVG is no longer wired — Solid handles New /
	// Continue / Settings entirely. lobby.hide() is a no-op when the
	// overlay was never shown.
	const screen = sim.worldEntity.get(Screen)?.value;
	demoPucks.group.visible = screen === "title";
	lobby.hide();
}

refreshLobby();

// === End-game radial ===
// PRQ-C3: end-game surface moved out of the diegetic SVG layer
// into the Solid branded overlay (`app/overlays/EndGame.tsx`). The
// scene's role is now just to play the win/loss audio sting; the
// overlay opens automatically when the Screen trait flips to "win" /
// "lose" / "spectator-result". The function below is a no-op stub
// retained so existing call sites in tick() compile.
function openEndGameRadial(_winner: Color, _humanColor: HumanColor): void {
	// no-op
}

// === Pause radial (bezel triple-tap detector) ===
// PRQ-C3: pause radial moved to Solid (`app/overlays/Pause.tsx`).
const pauseRadial = null as MenuRadialHandle | null;
const knockTimes: number[] = [];
function registerKnock(): void {
	const now = performance.now();
	knockTimes.push(now);
	while (knockTimes.length > 0) {
		const first = knockTimes[0];
		if (first === undefined) break;
		if (now - first > tokens.motion.knockWindowMs) knockTimes.shift();
		else break;
	}
	if (knockTimes.length >= 3) {
		knockTimes.length = 0;
		openPauseRadial();
	}
}

function openPauseRadial(): void {
	// PRQ-C3: the pause surface moved out of the diegetic SVG layer
	// into the Solid branded overlay (`app/overlays/Pause.tsx`).
	// The Solid layer subscribes to its own `modal` signal and opens
	// the pause overlay directly when the bezel hamburger fires.
	// This stub remains as a no-op so the testHook and the legacy
	// triple-tap detector can call it without errors.
}

// Triple-tap detector on bezel: any pointer-down outside the board
// raycast hit area counts as a "knock". The simplest implementation:
// when the input pipeline's onPointerDown fires but cellAtPointer
// returns null AND no selection is active, register a knock. Doing
// this here in the scene index keeps the input pipeline pure.
canvas.addEventListener(
	"pointerdown",
	(e) => {
		// Only react when no selection is active and the click is
		// well outside the board area. Use the canvas bounding rect
		// to roughly detect "outside the inner playfield" — anywhere
		// in the corner ~120px from any edge counts as bezel.
		const sel = sim.worldEntity.get(Selection)?.cell;
		if (sel !== null && sel !== undefined) return;
		const rect = canvas.getBoundingClientRect();
		const inset = Math.min(rect.width, rect.height) * 0.18;
		const isCorner =
			e.clientX < rect.left + inset ||
			e.clientX > rect.right - inset ||
			e.clientY < rect.top + inset ||
			e.clientY > rect.bottom - inset;
		if (isCorner) registerKnock();
	},
	true, // capture so we see it before input.ts's handler
);

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
		if (match.turn !== priorTurn) {
			priorTurn = match.turn;
			// AI-vs-AI matches (humanColor === null): the board auto-
			// tips on every turn-flip and the broker auto-dispatches
			// the next ply. No human gesture in the loop.
			//
			// Three modes of turn-flip handling:
			//   - AI-vs-AI sim (humanColor === null): auto-tip every
			//     turn-flip, auto-dispatch next ply.
			//   - vs-AI (humanColor === "red" | "white"): auto-tip +
			//     auto-dispatch only when the AI just finished (turn
			//     flipped TO the human's colour). Human-side turn-end
			//     fires from endHumanTurn after the pivot gesture.
			//   - Pass-and-Play (humanColor === "both"): NEVER auto-tip
			//     here. The 180° handoff fires from endHumanTurn after
			//     the player's pivot gesture. No AI dispatch.
			const hc = match.humanColor;
			const isPap = hc === "both";
			const isSim = hc === null;
			const isAiSideTurnEnd = !isPap && !isSim && match.turn === hc;
			if (isSim || isAiSideTurnEnd) {
				const facing = match.turn === "red" ? -1 : 1;
				tweenBoardTip({ boardGroup: board.group, direction: facing });
				if (isSim && !aiThinking && match.winner === null) {
					void actions.stepTurn();
				}
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
				if (humanColor !== null) {
					void playSfx(humanColor === match.winner ? "win" : "lose");
				}
				openEndGameRadial(match.winner, humanColor);
			}
			priorWinner = match.winner;
		}
	} else if (priorPiecesSig !== "") {
		// No active match — clear pieces so the lobby demo pucks own the
		// stage. (Don't render FALLBACK_PIECES; it was a placeholder for
		// the pre-lobby boot path that no longer exists.)
		pieces.sync([]);
		priorPiecesSig = "";
	}

	const selSig = selectionSignature(sel);
	if (selSig !== priorSelectionSig) {
		priorSelectionSig = selSig;
		inputCtx.refreshSelectionVisuals();
		refreshSplitRadial();
	}

	splitRadial.update();
	lobby.update();
	pauseRadial?.update();

	updateBoardProjection();

	renderer.render(scene, camera);
}

// Per-frame projection of every board cell's anchor into screen-space CSS
// pixels. Read by the Solid `BoardA11yGrid` component to position the
// invisible <button role="gridcell"> overlay that delegates clicks back
// to the input layer's selection path. See src/sim/board-projection.ts
// for the contract; PRQ-C3a for the why.
const projectionScratch = new THREE.Vector3();
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
			projectionScratch.set(local.x, local.y, local.z);
			board.group.localToWorld(projectionScratch);
			projectionScratch.project(camera);
			const offscreen = projectionScratch.z >= 1 || projectionScratch.z <= -1;
			const x = (projectionScratch.x * 0.5 + 0.5) * rect.width + rect.left;
			const y = (projectionScratch.y * -0.5 + 0.5) * rect.height + rect.top;
			boardProjection.cells[cellIndex(col, row)] = { x, y, offscreen };
		}
	}
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
				openPauseRadial,
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
		lobby.dispose();
		pauseRadial?.close();
		renderer.dispose();
	});
}

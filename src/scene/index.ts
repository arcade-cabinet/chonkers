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
	applyAction as applyEngineAction,
	type Color,
	enumerateLegalActions,
	type GameState,
} from "@/engine";
import {
	type ActiveMatchSnapshot,
	clearActiveMatch,
	loadActiveMatch,
	saveActiveMatch,
	snapshotFromHandle,
} from "@/persistence";
import { decideFirstPlayer } from "@/sim";
import {
	AiThinking,
	Match,
	type PiecePlacement,
	Screen,
	Selection,
	type SelectionSnapshot,
} from "@/sim/traits";
import { buildSimActions, createSimWorld, type SimWorld } from "@/sim/world";
import { tweenBoardTip } from "./animations";
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
import { type MenuRadialHandle, openMenuRadial } from "./overlay/menuRadial";
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
const humanColorForSnapshot: { current: Color | null } = { current: "red" };

const sim: SimWorld = createSimWorld({
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

const actions = buildSimActions(sim)(sim.world);

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
		return (
			screen === "play" &&
			m.turn === m.humanColor &&
			!thinking &&
			m.winner === null
		);
	},
	humanColor: (): Color | null =>
		sim.worldEntity.get(Match)?.humanColor ?? null,
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
		// The pivot-drag gesture. Clears the await-pivot flag, then
		// dispatches the AI. The board-tip animation runs from the
		// drag itself; tick()'s turn-change branch will see priorTurn
		// === match.turn (already updated by us during the human's
		// commit) and skip the redundant tween.
		const wasAwaiting = humanAwaitingPivot;
		humanAwaitingPivot = false;
		if (wasAwaiting) {
			const facing = sim.handle?.game.turn === "red" ? -1 : 1;
			tweenBoardTip({ boardGroup: board.group, direction: facing });
		}
		void actions.stepTurn();
	},
});

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
	// Detect chonk: the destination cell already has pieces before
	// applyAction lands.
	const dest = action.runs[0]?.to;
	const wasChonk = dest
		? handle.game.board.has((BigInt(dest.col) << 16n) | BigInt(dest.row))
		: false;
	handle.game = applyEngineAction(handle.game, action);
	actions.setSelection(null);
	if (wasChonk) void playChonkHaptic();
	// Per the diegetic-UI rule: the player does NOT auto-end their
	// turn. The engine has flipped state.turn (so the AI is on
	// "logical" turn), but the scene gates AI dispatch + board tip
	// behind the pivot-drag gesture. The flag is read by the tick()
	// loop's turn-change branch and by `endHumanTurn`. AI-vs-AI
	// matches don't set this flag (humanColor === null path).
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

async function startNewMatch(humanColor: Color | null = "red"): Promise<void> {
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

async function resumeFromSnapshot(
	snapshot: ActiveMatchSnapshot,
): Promise<void> {
	await ensureAudio();
	humanColorForSnapshot.current = snapshot.humanColor;
	matchStartedAt.current = snapshot.startedAt;
	actions.newMatch({
		redProfile: snapshot.redProfile,
		whiteProfile: snapshot.whiteProfile,
		humanColor: snapshot.humanColor,
		coinFlipSeed: snapshot.coinFlipSeed,
	});
	const handle = sim.handle;
	if (!handle) return;
	for (const action of snapshot.actions) {
		handle.game = applyEngineAction(handle.game, action);
	}
	// Sync match traits with the new ply count + state.
	actions.syncTraits({
		humanColor: snapshot.humanColor,
		plyCount: snapshot.actions.length,
	});
}

let resumeAvailable = false;
void (async () => {
	const saved = await loadActiveMatch();
	resumeAvailable = saved !== null;
	refreshLobby();
})();

function refreshLobby(): void {
	const screen = sim.worldEntity.get(Screen)?.value;
	if (screen === "title") {
		demoPucks.group.visible = true;
		lobby.show({
			playTarget: demoPucks.redPuck,
			resumeTarget: demoPucks.whitePuck,
			resumeEnabled: resumeAvailable,
			onPlay: () => {
				lobby.hide();
				demoPucks.group.visible = false;
				void startNewMatch("red");
			},
			onResume: () => {
				lobby.hide();
				demoPucks.group.visible = false;
				void (async () => {
					const saved = await loadActiveMatch();
					if (saved) await resumeFromSnapshot(saved);
				})();
			},
		});
	} else {
		demoPucks.group.visible = false;
		lobby.hide();
	}
}

refreshLobby();

// === End-game radial ===
let endGameRadial: MenuRadialHandle | null = null;
function openEndGameRadial(winner: Color, humanColor: Color | null): void {
	if (endGameRadial) return;
	// Anchor on a winning home-row piece if possible; fall back to
	// board centre.
	const winnerHomeRow = winner === "red" ? 10 : 0; // opponent's home
	const match = sim.worldEntity.get(Match);
	let target: THREE.Object3D | null = null;
	if (match) {
		for (const p of match.pieces) {
			if (p.row === winnerHomeRow && p.color === winner) {
				const top = pieces.topPuckAt(p.col, p.row);
				if (top) {
					target = top;
					break;
				}
			}
		}
	}
	if (!target) {
		// Fallback: board centre. Spawn an invisible anchor.
		const anchor = new THREE.Object3D();
		anchor.position.set(0, 0.6, 0);
		board.group.add(anchor);
		target = anchor;
	}

	const heading =
		humanColor === null
			? `${winner === "red" ? "Red" : "White"} wins`
			: humanColor === winner
				? "You win"
				: "You lose";

	endGameRadial = openMenuRadial({
		host: overlay,
		camera,
		canvas,
		target,
		slices: [
			{
				label: "Play again",
				onSelect: () => {
					endGameRadial = null;
					actions.quitMatch();
				},
			},
			{
				label: heading,
				onSelect: () => {
					endGameRadial = null;
					actions.quitMatch();
				},
			},
		],
	});
}

// === Pause radial (bezel triple-tap detector) ===
let pauseRadial: MenuRadialHandle | null = null;
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
	if (pauseRadial) return;
	const screen = sim.worldEntity.get(Screen)?.value;
	if (screen !== "play") return;
	const anchor = new THREE.Object3D();
	anchor.position.set(0, 0.6, 0);
	board.group.add(anchor);
	pauseRadial = openMenuRadial({
		host: overlay,
		camera,
		canvas,
		target: anchor,
		slices: [
			{
				label: "Resume",
				onSelect: () => {
					pauseRadial = null;
					board.group.remove(anchor);
				},
			},
			{
				label: "Forfeit",
				onSelect: () => {
					pauseRadial = null;
					board.group.remove(anchor);
					void actions.forfeit();
				},
			},
			{
				label: "Quit",
				onSelect: () => {
					pauseRadial = null;
					board.group.remove(anchor);
					void clearActiveMatch();
					actions.quitMatch();
				},
			},
		],
	});
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
			// Player-vs-AI matches: the auto-tip + auto-dispatch are
			// gated behind the pivot-drag. While humanAwaitingPivot is
			// true, the engine has already flipped state.turn (so the
			// AI is "logically" on turn) but the SCENE waits for the
			// player to physically tip the board before tipping the
			// view + dispatching the AI. `endHumanTurn` clears the
			// flag and runs both the tween + dispatch.
			//
			// AI-side turn-end (after AI's commit) DOES auto-tip +
			// auto-dispatch — the AI has no hands to gesture with.
			const isInteractive = match.humanColor !== null;
			const isAiSideTurnEnd = isInteractive && match.turn === match.humanColor;
			if (!isInteractive || isAiSideTurnEnd) {
				const facing = match.turn === "red" ? -1 : 1;
				tweenBoardTip({ boardGroup: board.group, direction: facing });
				if (isInteractive === false && !aiThinking && match.winner === null) {
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
	endGameRadial?.update();

	renderer.render(scene, camera);
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
			get humanColor(): "red" | "white" | null {
				return sim.worldEntity.get(Match)?.humanColor ?? null;
			},
			get aiThinking(): boolean {
				return sim.worldEntity.get(AiThinking)?.value ?? false;
			},
			get pieces(): ReadonlyArray<PiecePlacement> {
				return sim.worldEntity.get(Match)?.pieces ?? [];
			},
			actions: {
				startNewMatch: (humanColor: Color | null = "red") =>
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
		endGameRadial?.close();
		renderer.dispose();
	});
}

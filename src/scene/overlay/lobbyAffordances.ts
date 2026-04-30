/**
 * Lobby diegetic affordances — Play and Resume radials.
 *
 * Per docs/DESIGN.md §"Diegetic UI" "Lobby Play / Resume": tap the
 * red puck to start a new match; tap the white puck to resume the
 * saved match (faded if no resumable match). Both render only while
 * `Screen === 'title'`.
 *
 * Single-slice full-circle SVG with a glyph in the centre — `▶` for
 * Play, `⏩` for Resume.
 */

import gsap from "gsap";
import type * as THREE from "three";
import { tokens } from "@/design";
import { buildSingleSliceSvg, mountOverlay, type OverlayHandle } from "./base";

const PLAY_GLYPH = "M -10 -14 L -10 14 L 16 0 Z";
const RESUME_GLYPH = "M -16 -12 L -16 12 L -2 0 Z M 0 -12 L 0 12 L 14 0 Z";

const DEFAULT_DIAMETER_PX = 110;

export interface LobbyAffordanceOptions {
	readonly host: HTMLElement;
	readonly camera: THREE.PerspectiveCamera;
	readonly canvas: HTMLCanvasElement;
	readonly diameterPx?: number;
}

export interface LobbyAffordanceHandle {
	/**
	 * Show the lobby affordances. `playTarget` and `resumeTarget` are
	 * the demo-puck meshes the SVGs anchor to. `resumeEnabled` toggles
	 * the Resume slice's opacity + cursor.
	 */
	show(opts: {
		readonly playTarget: THREE.Object3D;
		readonly resumeTarget: THREE.Object3D;
		readonly resumeEnabled: boolean;
		readonly onPlay: () => void;
		readonly onResume: () => void;
	}): void;
	hide(): void;
	/** Per-frame projector — call from rAF while shown. */
	update(): void;
	dispose(): void;
}

export function buildLobbyAffordances(
	opts: LobbyAffordanceOptions,
): LobbyAffordanceHandle {
	const diameterPx = opts.diameterPx ?? DEFAULT_DIAMETER_PX;

	let active: {
		play: OverlayHandle;
		resume: OverlayHandle;
	} | null = null;

	function show(showOpts: {
		readonly playTarget: THREE.Object3D;
		readonly resumeTarget: THREE.Object3D;
		readonly resumeEnabled: boolean;
		readonly onPlay: () => void;
		readonly onResume: () => void;
	}): void {
		if (active) hide();

		const playSvg = buildSingleSliceSvg({
			diameterPx,
			fillColor: tokens.wood.pieceRed,
			strokeColor: tokens.ink.inverse,
			glyphPath: PLAY_GLYPH,
			glyphFill: tokens.ink.inverse,
			ariaLabel: "Play new match",
		});
		playSvg.addEventListener("pointerdown", (e) => {
			e.stopPropagation();
			showOpts.onPlay();
		});

		const resumeSvg = buildSingleSliceSvg({
			diameterPx,
			fillColor: tokens.wood.pieceWhite,
			strokeColor: tokens.ink.primary,
			glyphPath: RESUME_GLYPH,
			glyphFill: tokens.ink.primary,
			disabled: !showOpts.resumeEnabled,
			ariaLabel: showOpts.resumeEnabled
				? "Resume match"
				: "Resume match (none saved)",
		});
		if (showOpts.resumeEnabled) {
			resumeSvg.addEventListener("pointerdown", (e) => {
				e.stopPropagation();
				showOpts.onResume();
			});
		}

		const play = mountOverlay({
			host: opts.host,
			target: showOpts.playTarget,
			camera: opts.camera,
			canvas: opts.canvas,
			svg: playSvg,
			diameterPx,
			cssClass: "ck-lobby-affordance",
		});
		const resume = mountOverlay({
			host: opts.host,
			target: showOpts.resumeTarget,
			camera: opts.camera,
			canvas: opts.canvas,
			svg: resumeSvg,
			diameterPx,
			cssClass: "ck-lobby-affordance",
		});
		gsap.from([playSvg, resumeSvg], {
			duration: tokens.motion.uiOpenMs / 1000,
			scale: 0.8,
			opacity: 0,
			transformOrigin: "center center",
			ease: "back.out(1.6)",
			stagger: 0.08,
		});

		active = { play, resume };
	}

	function hide(): void {
		if (!active) return;
		const { play, resume } = active;
		gsap.to([play.svg, resume.svg], {
			duration: tokens.motion.uiCloseMs / 1000,
			scale: 0.85,
			opacity: 0,
			ease: "power1.in",
			onComplete: () => {
				play.dispose();
				resume.dispose();
			},
		});
		active = null;
	}

	function update(): void {
		active?.play.update();
		active?.resume.update();
	}

	function dispose(): void {
		if (active) {
			active.play.dispose();
			active.resume.dispose();
			active = null;
		}
	}

	return { show, hide, update, dispose };
}

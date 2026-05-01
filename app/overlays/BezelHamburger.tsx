/**
 * Bezel hamburger — the only persistent in-game UI chrome.
 *
 * Anchored to the top-right corner of the BEZEL MESH (not the
 * viewport) via per-frame projection from `@/sim/board-projection`.
 * Tracks the board through tilts + 180° handoffs so it always sits
 * on the corner of the physical board frame, not floating above the
 * scene unrelated to anything. Opens the Pause overlay on click.
 */

import { createSignal, type JSX, onCleanup, onMount } from "solid-js";
import { boardProjection } from "@/sim/board-projection";
import { openModal } from "../stores/ui-store";

interface AnchorPos {
	readonly x: number;
	readonly y: number;
	readonly hidden: boolean;
}

const HIDDEN: AnchorPos = { x: 0, y: 0, hidden: true };

export function BezelHamburger(): JSX.Element {
	const [pos, setPos] = createSignal<AnchorPos>(HIDDEN);

	let raf = 0;
	let lastFrame = -1;
	let lastX = Number.NaN;
	let lastY = Number.NaN;
	let lastHidden = true;
	const tick = () => {
		if (boardProjection.ready && boardProjection.frame !== lastFrame) {
			lastFrame = boardProjection.frame;
			const c = boardProjection.bezelTopRight;
			// Round to whole pixels — sub-pixel projector jitter would
			// keep the <button> "animating" forever, and Playwright's
			// click() retries until the element is stable. The hit
			// target is 44px so integer rounding is invisible.
			const nx = Math.round(c.x);
			const ny = Math.round(c.y);
			if (nx !== lastX || ny !== lastY || c.offscreen !== lastHidden) {
				lastX = nx;
				lastY = ny;
				lastHidden = c.offscreen;
				setPos({ x: nx, y: ny, hidden: c.offscreen });
			}
		} else if (!boardProjection.ready && lastFrame !== -1) {
			lastFrame = -1;
			lastX = Number.NaN;
			lastY = Number.NaN;
			lastHidden = true;
			setPos(HIDDEN);
		}
		raf = requestAnimationFrame(tick);
	};

	onMount(() => {
		raf = requestAnimationFrame(tick);
	});
	onCleanup(() => {
		cancelAnimationFrame(raf);
	});

	return (
		<button
			type="button"
			class="ck-hamburger"
			aria-label="Pause menu"
			style={{
				transform: `translate(${pos().x}px, ${pos().y}px)`,
				visibility: pos().hidden ? "hidden" : "visible",
			}}
			onClick={() => openModal("pause")}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<title>Pause menu</title>
				<rect x="3" y="6" width="18" height="2" rx="1" />
				<rect x="3" y="11" width="18" height="2" rx="1" />
				<rect x="3" y="16" width="18" height="2" rx="1" />
			</svg>
		</button>
	);
}

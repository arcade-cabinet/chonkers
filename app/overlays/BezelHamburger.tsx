/**
 * Bezel hamburger — the only persistent in-game UI chrome.
 *
 * A small fixed-position button anchored to the top-right corner of
 * the viewport. Opens the Pause overlay. Visible only when screen
 * === "play" AND no other overlay is open (the parent App component
 * gates visibility via the screen signal; modal stacking is handled
 * by the modal opener which always closes Pause first).
 */

import type { JSX } from "solid-js";
import { openModal } from "../stores/ui-store";

export function BezelHamburger(): JSX.Element {
	return (
		<button
			type="button"
			class="ck-hamburger"
			aria-label="Pause menu"
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

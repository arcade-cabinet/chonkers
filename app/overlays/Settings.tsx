/**
 * Settings overlay. v1 fields:
 *   - Audio mute
 *   - Haptics
 *   - Reduced motion (defaults from prefers-reduced-motion)
 *   - Default difficulty
 *
 * Persists to the kv settings namespace. English-only.
 */

import { createSignal, type JSX, onMount } from "solid-js";
import { kv } from "@/persistence/preferences/kv";
import { Button } from "../primitives/Button";
import { Modal } from "../primitives/Modal";
import { closeModal } from "../stores/ui-store";

const SETTINGS_NS = "settings";

export function Settings(): JSX.Element {
	const [muted, setMuted] = createSignal(false);
	const [haptics, setHaptics] = createSignal(true);
	const [reducedMotion, setReducedMotion] = createSignal(false);
	const [defaultDifficulty, setDefaultDifficulty] = createSignal<
		"easy" | "medium" | "hard"
	>("medium");

	onMount(async () => {
		try {
			const m = await kv.get<boolean>(SETTINGS_NS, "muted");
			if (m !== null) setMuted(m);
			const h = await kv.get<boolean>(SETTINGS_NS, "haptics");
			if (h !== null) setHaptics(h);
			const r = await kv.get<boolean>(SETTINGS_NS, "reducedMotion");
			if (r !== null) {
				setReducedMotion(r);
			} else {
				const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
				setReducedMotion(mq.matches);
			}
			const d = await kv.get<"easy" | "medium" | "hard">(
				SETTINGS_NS,
				"defaultDifficulty",
			);
			if (d !== null) setDefaultDifficulty(d);
		} catch {
			/* fall back to defaults */
		}
	});

	const persist = async <T,>(key: string, value: T) => {
		try {
			await kv.put(SETTINGS_NS, key, value);
		} catch {
			/* silent — kv handles its own logging */
		}
	};

	const onMuteChange = (e: Event) => {
		const v = (e.target as HTMLInputElement).checked;
		setMuted(v);
		void persist("muted", v);
	};
	const onHapticsChange = (e: Event) => {
		const v = (e.target as HTMLInputElement).checked;
		setHaptics(v);
		void persist("haptics", v);
	};
	const onReducedChange = (e: Event) => {
		const v = (e.target as HTMLInputElement).checked;
		setReducedMotion(v);
		void persist("reducedMotion", v);
	};
	const onDifficultyChange = (e: Event) => {
		const v = (e.target as HTMLInputElement).value as
			| "easy"
			| "medium"
			| "hard";
		setDefaultDifficulty(v);
		void persist("defaultDifficulty", v);
	};

	return (
		<Modal label="Settings" onClose={closeModal}>
			<div class="ck-settings">
				<h2 class="ck-settings__title">Settings</h2>
				<label class="ck-settings__row">
					<input type="checkbox" checked={muted()} onChange={onMuteChange} />
					<span>Mute audio</span>
				</label>
				<label class="ck-settings__row">
					<input
						type="checkbox"
						checked={haptics()}
						onChange={onHapticsChange}
					/>
					<span>Haptics</span>
				</label>
				<label class="ck-settings__row">
					<input
						type="checkbox"
						checked={reducedMotion()}
						onChange={onReducedChange}
					/>
					<span>Reduced motion</span>
				</label>
				<div
					class="ck-settings__row"
					role="radiogroup"
					aria-label="Default difficulty"
				>
					<span class="ck-settings__legend">Default difficulty</span>
					{(["easy", "medium", "hard"] as const).map((d) => (
						<label>
							<input
								type="radio"
								name="ck-default-difficulty"
								value={d}
								checked={defaultDifficulty() === d}
								onChange={onDifficultyChange}
							/>
							<span>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
						</label>
					))}
				</div>
				<Button variant="primary" onClick={closeModal}>
					Done
				</Button>
			</div>
		</Modal>
	);
}

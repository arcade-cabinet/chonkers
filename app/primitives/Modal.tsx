/**
 * Modal primitive — a real native <dialog> element with ESC handling
 * + initial focus + an ARIA-labelled heading.
 *
 * Solid renders a <dialog>; on mount we call `showModal()` so the
 * browser provides a focus trap, the ::backdrop pseudo, and ESC
 * cancellation for free. The `onClose` prop fires for both ESC and
 * any explicit `dialog.close()` call.
 */

import { type JSX, onCleanup, onMount } from "solid-js";

interface ModalProps {
	readonly label: string;
	readonly onClose?: () => void;
	readonly initialFocus?: "first-button" | "none";
	readonly children: JSX.Element;
}

export function Modal(props: ModalProps): JSX.Element {
	let dialogRef: HTMLDialogElement | undefined;

	onMount(() => {
		const dlg = dialogRef;
		if (!dlg) return;
		dlg.showModal();
		// Initial focus: the first focusable button inside the dialog.
		// The browser focuses the first descendant by default, but
		// some focus targets (the <dialog> itself) aren't useful.
		if (props.initialFocus !== "none") {
			const firstBtn = dlg.querySelector<HTMLButtonElement>(
				"button:not([disabled])",
			);
			firstBtn?.focus();
		}
		const onCancel = (ev: Event) => {
			// When `onClose` is undefined the dialog has no dismissal path
			// — let the browser handle ESC natively (closes the dialog)
			// instead of preventDefault'ing into a non-dismissible state.
			if (!props.onClose) return;
			ev.preventDefault();
			props.onClose();
		};
		dlg.addEventListener("cancel", onCancel);
		onCleanup(() => {
			dlg.removeEventListener("cancel", onCancel);
			if (dlg.open) dlg.close();
		});
	});

	return (
		<dialog ref={dialogRef} class="ck-modal" aria-label={props.label}>
			{props.children}
		</dialog>
	);
}

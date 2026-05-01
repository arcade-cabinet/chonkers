import type { JSX } from "solid-js";

interface CardProps {
	readonly title: string;
	readonly descriptor: string;
	readonly onClick: () => void;
}

/**
 * Difficulty / mode card — a button shaped like a card. Title +
 * descriptor are both visible to screen readers via the button's
 * accessible name (concatenated by aria-label).
 */
export function Card(props: CardProps): JSX.Element {
	return (
		<button
			type="button"
			class="ck-card"
			aria-label={`${props.title}. ${props.descriptor}`}
			onClick={props.onClick}
		>
			<span class="ck-card__title">{props.title}</span>
			<span class="ck-card__descriptor">{props.descriptor}</span>
		</button>
	);
}

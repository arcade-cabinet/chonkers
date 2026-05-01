import { type JSX, splitProps } from "solid-js";

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
	readonly variant?: "primary" | "secondary" | "tertiary";
}

export function Button(props: ButtonProps): JSX.Element {
	const [local, rest] = splitProps(props, ["variant", "class", "children"]);
	const variant = local.variant ?? "primary";
	return (
		<button
			type="button"
			class={`ck-btn ck-btn--${variant} ${local.class ?? ""}`}
			aria-disabled={rest.disabled ? "true" : undefined}
			{...rest}
		>
			{local.children}
		</button>
	);
}

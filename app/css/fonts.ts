/**
 * Self-hosted font-face installer. Replaces app/css/fonts.css —
 * the CSS-relative `../assets/fonts/...` paths resolved correctly
 * in production builds (where Vite copies fonts to dist/assets/
 * alongside the bundled CSS) but 404'd in dev mode where the
 * source CSS at app/css/fonts.css resolves the relative path to
 * `app/assets/fonts/...` which doesn't exist.
 *
 * Solving this in TS via `ASSETS.fonts.*` (which already prefixes
 * `import.meta.env.BASE_URL`) means there is exactly one place in
 * the codebase that cares about the BASE_URL deployment prefix:
 * `src/utils/manifest.ts`.
 *
 * The faces are injected via a single dynamically-built
 * <style> element so the FOUC shape matches the prior CSS-only
 * approach exactly.
 */

import { ASSETS } from "@/utils/manifest";

interface FaceSpec {
	readonly family: string;
	readonly style: "normal" | "italic";
	readonly weight: number;
	readonly url: string;
}

const FACES: ReadonlyArray<FaceSpec> = [
	// Lato body weights — the manifest only exposes the regular weight,
	// so we derive the other tokens from the same path stem.
	{
		family: "Lato",
		style: "normal",
		weight: 100,
		url: variantUrl(ASSETS.fonts.body, "Lato-Thin.ttf"),
	},
	{
		family: "Lato",
		style: "italic",
		weight: 100,
		url: variantUrl(ASSETS.fonts.body, "Lato-ThinItalic.ttf"),
	},
	{
		family: "Lato",
		style: "normal",
		weight: 300,
		url: variantUrl(ASSETS.fonts.body, "Lato-Light.ttf"),
	},
	{
		family: "Lato",
		style: "italic",
		weight: 300,
		url: variantUrl(ASSETS.fonts.body, "Lato-LightItalic.ttf"),
	},
	{
		family: "Lato",
		style: "normal",
		weight: 400,
		url: ASSETS.fonts.body,
	},
	{
		family: "Lato",
		style: "italic",
		weight: 400,
		url: variantUrl(ASSETS.fonts.body, "Lato-Italic.ttf"),
	},
	{
		family: "Lato",
		style: "normal",
		weight: 700,
		url: variantUrl(ASSETS.fonts.body, "Lato-Bold.ttf"),
	},
	{
		family: "Lato",
		style: "italic",
		weight: 700,
		url: variantUrl(ASSETS.fonts.body, "Lato-BoldItalic.ttf"),
	},
	{
		family: "Lato",
		style: "normal",
		weight: 900,
		url: variantUrl(ASSETS.fonts.body, "Lato-Black.ttf"),
	},
	{
		family: "Lato",
		style: "italic",
		weight: 900,
		url: variantUrl(ASSETS.fonts.body, "Lato-BlackItalic.ttf"),
	},
	{
		family: "Abril Fatface",
		style: "normal",
		weight: 400,
		url: ASSETS.fonts.header,
	},
];

function variantUrl(referenceUrl: string, filename: string): string {
	const lastSlash = referenceUrl.lastIndexOf("/");
	if (lastSlash < 0) return filename;
	return `${referenceUrl.slice(0, lastSlash + 1)}${filename}`;
}

function buildFaceCss(): string {
	return FACES.map(
		(f) => `@font-face {
	font-family: ${f.family.includes(" ") ? `"${f.family}"` : f.family};
	font-style: ${f.style};
	font-weight: ${f.weight};
	font-display: swap;
	src: url("${f.url}") format("truetype");
}`,
	).join("\n\n");
}

let installed = false;

export function installFonts(): void {
	if (installed) return;
	installed = true;
	const style = document.createElement("style");
	style.setAttribute("data-chonkers-fonts", "true");
	style.textContent = buildFaceCss();
	document.head.appendChild(style);
}

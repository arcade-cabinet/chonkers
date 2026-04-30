/**
 * src/design — design tokens + theme + motion variants.
 *
 * Pure constants and types. No runtime IO, no React, no DOM.
 * Consumed by the visual shell (`app/`) for component theming
 * and by `src/audio/` for nothing — audio + design are sibling
 * leaf packages.
 *
 * Per CLAUDE.md import boundary: this package imports only
 * `framer-motion` and `@radix-ui/themes` types. It does NOT
 * import from `@/engine`, `@/ai`, `@/sim`, `@/store`, or
 * anywhere in `app/`.
 */

export {
	holdFlash,
	modalIn,
	modalOut,
	radialClose,
	radialOpen,
	reducedMotionFallback,
	screenFade,
	sliceSelect,
} from "./motion";
export { radixTheme } from "./theme";
export { type Tokens, tokens } from "./tokens";

/**
 * src/design — design tokens.
 *
 * Pure constants and types. No runtime IO, no DOM, no React.
 * Consumed directly by `src/scene/` (materials, SVG markup,
 * tween durations). There is no Radix theme bridge and no
 * framer-motion variant library — animation lives in
 * `src/scene/animations.ts` as gsap factories that read motion
 * durations from `tokens.motion.*`.
 */

export { type Tokens, tokens } from "./tokens";

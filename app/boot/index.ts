/**
 * app/boot — one-time app initialisation + React context wiring.
 *
 * `boot()` runs the async setup (DB, audio, sim) and returns a
 * `BootResult`. `<SimProvider boot={...}>` wraps the React tree so
 * descendants can pull `useSimActions()` + `useAudio()`. The koota
 * world is exposed via koota/react's `WorldProvider`.
 *
 * `<ErrorBoundary>` wraps the whole tree so boot rejections + render
 * errors surface a clean recovery UI instead of a blank page.
 */

export { type BootResult, boot } from "./boot";
export { ErrorBoundary } from "./ErrorBoundary";
export { SimProvider, useAudio, useSimActions } from "./SimContext";

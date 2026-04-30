/**
 * src/audio — Howler-backed audio bus.
 *
 * Public surface: `getAudioBus()` returns the lazy async singleton.
 * Callers always `const audio = await getAudioBus(); audio.play(role)`.
 *
 * See `src/audio/README.md` for the role table and quick-start.
 */

export type { AudioBus, AudioRole } from "./audioBus";
export { getAudioBus } from "./audioBus";
export { AUDIO_ROLES, STING_ROLES } from "./roles";

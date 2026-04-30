/**
 * Role → audio-file mapping. The seven committed clips under
 * `public/assets/audio/`. Roles are the playback contract; file
 * paths are an internal detail.
 *
 * `ambient` is the only loop role. The rest are one-shots.
 */

export const AUDIO_ROLES = {
	ambient: "/assets/audio/ambient/bg_loop.wav",
	move: "/assets/audio/effects/move.ogg",
	chonk: "/assets/audio/effects/chonk.ogg",
	split: "/assets/audio/effects/split.ogg",
	sting: "/assets/audio/effects/game_over_sting.ogg",
	win: "/assets/audio/voices/you_win.ogg",
	lose: "/assets/audio/voices/you_lose.ogg",
} as const;

export type AudioRole = keyof typeof AUDIO_ROLES;

/** Stings + voice cues that duck the ambient loop while playing. */
export const STING_ROLES: ReadonlyArray<AudioRole> = ["sting", "win", "lose"];

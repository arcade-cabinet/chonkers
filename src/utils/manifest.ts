/**
 * Single source of truth for asset paths. Components import from
 * ASSETS.* — never type literal paths.
 *
 * All assets live under public/assets/ and ship with the bundle.
 *
 * Paths are resolved against `import.meta.env.BASE_URL` at module
 * load so non-root deployments (GitHub Pages project sites under
 * `/chonkers/`) get the correct prefix automatically.
 */

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const a = (p: string): string => `${BASE}${p}`;

export const ASSETS = {
	hdri: a("/assets/hdri/background.exr"),
	audio: {
		ambient: a("/assets/audio/ambient/bg_loop.wav"),
		move: a("/assets/audio/effects/move.ogg"),
		chonk: a("/assets/audio/effects/chonk.ogg"),
		split: a("/assets/audio/effects/split.ogg"),
		sting: a("/assets/audio/effects/game_over_sting.ogg"),
		win: a("/assets/audio/voices/you_win.ogg"),
		lose: a("/assets/audio/voices/you_lose.ogg"),
	},
	pbr: {
		boardMain: {
			diffuse: a("/assets/pbr/game_board_main/WoodFloor007_1K-PNG_Color.png"),
			normal: a("/assets/pbr/game_board_main/WoodFloor007_1K-PNG_NormalGL.png"),
			roughness: a(
				"/assets/pbr/game_board_main/WoodFloor007_1K-PNG_Roughness.png",
			),
			displacement: a(
				"/assets/pbr/game_board_main/WoodFloor007_1K-PNG_Displacement.png",
			),
			ao: a(
				"/assets/pbr/game_board_main/WoodFloor007_1K-PNG_AmbientOcclusion.png",
			),
		},
		boardHome: {
			diffuse: a("/assets/pbr/game_board_home/WoodFloor008_1K-PNG_Color.png"),
			normal: a("/assets/pbr/game_board_home/WoodFloor008_1K-PNG_NormalGL.png"),
			roughness: a(
				"/assets/pbr/game_board_home/WoodFloor008_1K-PNG_Roughness.png",
			),
			displacement: a(
				"/assets/pbr/game_board_home/WoodFloor008_1K-PNG_Displacement.png",
			),
		},
		redPiece: {
			diffuse: a("/assets/pbr/red_piece/Wood008_1K-PNG_Color.png"),
			normal: a("/assets/pbr/red_piece/Wood008_1K-PNG_NormalGL.png"),
			roughness: a("/assets/pbr/red_piece/Wood008_1K-PNG_Roughness.png"),
			displacement: a("/assets/pbr/red_piece/Wood008_1K-PNG_Displacement.png"),
		},
		whitePiece: {
			diffuse: a("/assets/pbr/white_piece/Wood031_1K-PNG_Color.png"),
			normal: a("/assets/pbr/white_piece/Wood031_1K-PNG_NormalGL.png"),
			roughness: a("/assets/pbr/white_piece/Wood031_1K-PNG_Roughness.png"),
			displacement: a("/assets/pbr/white_piece/Wood031_1K-PNG_Displacement.png"),
		},
	},
	fonts: {
		body: a("/assets/fonts/body/Lato-Regular.ttf"),
		header: a("/assets/fonts/headers/AbrilFatface-Regular.ttf"),
	},
} as const;

export type AssetManifest = typeof ASSETS;

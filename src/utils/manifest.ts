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
const asset = (p: string): string => `${BASE}/assets/${p}`;

export const ASSETS = {
	hdri: asset("hdri/background.exr"),
	audio: {
		ambient: asset("audio/ambient/bg_loop.wav"),
		move: asset("audio/effects/move.ogg"),
		chonk: asset("audio/effects/chonk.ogg"),
		split: asset("audio/effects/split.ogg"),
		sting: asset("audio/effects/game_over_sting.ogg"),
		win: asset("audio/voices/you_win.ogg"),
		lose: asset("audio/voices/you_lose.ogg"),
	},
	pbr: {
		boardMain: {
			diffuse: asset("pbr/game_board_main/WoodFloor007_1K-PNG_Color.png"),
			normal: asset("pbr/game_board_main/WoodFloor007_1K-PNG_NormalGL.png"),
			roughness: asset("pbr/game_board_main/WoodFloor007_1K-PNG_Roughness.png"),
			displacement: asset(
				"pbr/game_board_main/WoodFloor007_1K-PNG_Displacement.png",
			),
			ao: asset("pbr/game_board_main/WoodFloor007_1K-PNG_AmbientOcclusion.png"),
		},
		boardHome: {
			diffuse: asset("pbr/game_board_home/WoodFloor008_1K-PNG_Color.png"),
			normal: asset("pbr/game_board_home/WoodFloor008_1K-PNG_NormalGL.png"),
			roughness: asset("pbr/game_board_home/WoodFloor008_1K-PNG_Roughness.png"),
			displacement: asset(
				"pbr/game_board_home/WoodFloor008_1K-PNG_Displacement.png",
			),
		},
		redPiece: {
			diffuse: asset("pbr/red_piece/Wood008_1K-PNG_Color.png"),
			normal: asset("pbr/red_piece/Wood008_1K-PNG_NormalGL.png"),
			roughness: asset("pbr/red_piece/Wood008_1K-PNG_Roughness.png"),
			displacement: asset("pbr/red_piece/Wood008_1K-PNG_Displacement.png"),
		},
		whitePiece: {
			diffuse: asset("pbr/white_piece/Wood031_1K-PNG_Color.png"),
			normal: asset("pbr/white_piece/Wood031_1K-PNG_NormalGL.png"),
			roughness: asset("pbr/white_piece/Wood031_1K-PNG_Roughness.png"),
			displacement: asset("pbr/white_piece/Wood031_1K-PNG_Displacement.png"),
		},
	},
	fonts: {
		body: asset("fonts/body/Lato-Regular.ttf"),
		header: asset("fonts/headers/AbrilFatface-Regular.ttf"),
	},
} as const;

export type AssetManifest = typeof ASSETS;

/**
 * Single source of truth for asset paths. Components import from
 * ASSETS.* — never type literal paths.
 *
 * All assets live under public/assets/ and ship with the bundle.
 */

export const ASSETS = {
	hdri: "/assets/hdri/background.exr",
	audio: {
		ambient: "/assets/audio/ambient/bg_loop.wav",
		move: "/assets/audio/effects/move.ogg",
		chonk: "/assets/audio/effects/chonk.ogg",
		split: "/assets/audio/effects/split.ogg",
		sting: "/assets/audio/effects/game_over_sting.ogg",
		win: "/assets/audio/voices/you_win.ogg",
		lose: "/assets/audio/voices/you_lose.ogg",
	},
	pbr: {
		boardMain: {
			diffuse: "/assets/pbr/game_board_main/WoodFloor007_1K-PNG_Color.png",
			normal: "/assets/pbr/game_board_main/WoodFloor007_1K-PNG_NormalGL.png",
			roughness:
				"/assets/pbr/game_board_main/WoodFloor007_1K-PNG_Roughness.png",
			displacement:
				"/assets/pbr/game_board_main/WoodFloor007_1K-PNG_Displacement.png",
			ao: "/assets/pbr/game_board_main/WoodFloor007_1K-PNG_AmbientOcclusion.png",
		},
		boardHome: {
			diffuse: "/assets/pbr/game_board_home/WoodFloor008_1K-PNG_Color.png",
			normal: "/assets/pbr/game_board_home/WoodFloor008_1K-PNG_NormalGL.png",
			roughness:
				"/assets/pbr/game_board_home/WoodFloor008_1K-PNG_Roughness.png",
			displacement:
				"/assets/pbr/game_board_home/WoodFloor008_1K-PNG_Displacement.png",
		},
		redPiece: {
			diffuse: "/assets/pbr/red_piece/Wood008_1K-PNG_Color.png",
			normal: "/assets/pbr/red_piece/Wood008_1K-PNG_NormalGL.png",
			roughness: "/assets/pbr/red_piece/Wood008_1K-PNG_Roughness.png",
			displacement: "/assets/pbr/red_piece/Wood008_1K-PNG_Displacement.png",
		},
		whitePiece: {
			diffuse: "/assets/pbr/white_piece/Wood031_1K-PNG_Color.png",
			normal: "/assets/pbr/white_piece/Wood031_1K-PNG_NormalGL.png",
			roughness: "/assets/pbr/white_piece/Wood031_1K-PNG_Roughness.png",
			displacement: "/assets/pbr/white_piece/Wood031_1K-PNG_Displacement.png",
		},
	},
	fonts: {
		body: "/assets/fonts/body/Lato-Regular.ttf",
		header: "/assets/fonts/headers/AbrilFatface-Regular.ttf",
	},
} as const;

export type AssetManifest = typeof ASSETS;

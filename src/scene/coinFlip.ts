/**
 * Coin-flip ceremony — a 3D coin spawned above the board, gsap-spun
 * for `tokens.motion.coinFlipMs`, lands on the face derived from the
 * match's `coinFlipSeed`.
 *
 * The coin is a thin cylinder with two colored faces (red on one
 * side, white on the other). The decision is computed by
 * `decideFirstPlayer(seed)` from `@/sim`; the visual just plays
 * whichever face the broker chose.
 */

import * as THREE from "three";
import { tokens } from "@/design";
import { tweenCoinSpin } from "./animations";
import type { PieceMaterials } from "./pieces";

export interface CoinFlipHandle {
	readonly group: THREE.Group;
	/** Spin and land on the given face. Resolves on completion. */
	flip(faceUp: "red" | "white"): Promise<void>;
	/** Hide the coin (without animating). */
	hide(): void;
	dispose(): void;
}

export function buildCoinFlip(materials: PieceMaterials): CoinFlipHandle {
	const { cellSize, puckRadius } = tokens.board;
	const radius = puckRadius * cellSize * 1.2;
	const thickness = 0.08;

	const group = new THREE.Group();
	group.name = "coin-flip";

	// The coin: thin cylinder, top face = red wood, bottom face = white wood.
	// Use two side materials by index to color each cap differently.
	const geom = new THREE.CylinderGeometry(radius, radius, thickness, 64);
	const mats = [
		new THREE.MeshStandardMaterial({
			color: tokens.wood.boardHome,
			roughness: 0.6,
			metalness: 0.3,
		}), // side
		materials.red, // top cap
		materials.white, // bottom cap
	];
	const coin = new THREE.Mesh(geom, mats);
	coin.castShadow = true;
	coin.position.set(0, 2.0, 0);
	coin.rotation.x = 0;
	group.add(coin);
	group.visible = false;

	async function flip(faceUp: "red" | "white"): Promise<void> {
		group.visible = true;
		coin.position.y = 2.0;
		coin.rotation.x = 0;
		return new Promise<void>((resolve) => {
			tweenCoinSpin({
				coin,
				faceUp,
				onComplete: () => resolve(),
			});
		});
	}

	function hide(): void {
		group.visible = false;
	}

	function dispose(): void {
		geom.dispose();
		// `mats[0]` is the side material — created inline above and
		// owned by this module, so it must be disposed here.
		// `mats[1]` (red) and `mats[2]` (white) are shared with the
		// pieces module and freed there.
		mats[0]?.dispose();
		group.remove(coin);
	}

	return { group, flip, hide, dispose };
}

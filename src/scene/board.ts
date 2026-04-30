/**
 * The 9×11 board mesh group.
 *
 * Two distinct PBR woods per `docs/DESIGN.md` §"The board as hero
 * surface": `WoodFloor007` for the interior playfield (rows 1–9)
 * and `WoodFloor008` for the home rows (row 0 and row 10), with
 * inset/engraved gridline geometry that catches shadow under
 * raking light. A dark-wood bezel frame surrounds the playfield.
 */

import * as THREE from "three";
import { tokens } from "@/design";
import { assetUrl } from "@/utils/assetUrl";
import { ASSETS } from "@/utils/manifest";

const TEXTURE_REPEAT_INTERIOR = 4;
const TEXTURE_REPEAT_HOME = 1.5;
const BOARD_THICKNESS = 0.3;
const GRIDLINE_WIDTH = 0.025;
// Gridlines sit slightly proud of the playfield surface — they read as
// the line itself rather than as a recessed groove, but the dark color
// + height differential gives the carved appearance under raking light
// from the key directional. Going deeper than ~3cm starts to compete
// with puck height.
const GRIDLINE_HEIGHT = 0.02;

interface BoardPbr {
	readonly diffuse: string;
	readonly normal: string;
	readonly roughness: string;
	readonly displacement: string;
	readonly ao?: string;
}

function loadPbr(
	loader: THREE.TextureLoader,
	set: BoardPbr,
	repeat: number,
): {
	map: THREE.Texture;
	normalMap: THREE.Texture;
	roughnessMap: THREE.Texture;
	displacementMap: THREE.Texture;
	aoMap?: THREE.Texture;
} {
	const apply = (tex: THREE.Texture) => {
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(repeat, repeat);
		return tex;
	};
	const diffuse = apply(loader.load(assetUrl(set.diffuse)));
	diffuse.colorSpace = THREE.SRGBColorSpace;
	const out: {
		map: THREE.Texture;
		normalMap: THREE.Texture;
		roughnessMap: THREE.Texture;
		displacementMap: THREE.Texture;
		aoMap?: THREE.Texture;
	} = {
		map: diffuse,
		normalMap: apply(loader.load(assetUrl(set.normal))),
		roughnessMap: apply(loader.load(assetUrl(set.roughness))),
		displacementMap: apply(loader.load(assetUrl(set.displacement))),
	};
	if (set.ao) out.aoMap = apply(loader.load(assetUrl(set.ao)));
	return out;
}

export interface BoardHandles {
	readonly group: THREE.Group;
	readonly playfield: THREE.Mesh;
	readonly homeRows: readonly [THREE.Mesh, THREE.Mesh];
}

export function buildBoard(): BoardHandles {
	const { cols, rows, cellSize } = tokens.board;
	const loader = new THREE.TextureLoader();

	const group = new THREE.Group();
	group.name = "board";

	// Base under-piece — a single wide slab so the cabinet has thickness.
	const baseGeom = new THREE.BoxGeometry(
		cols * cellSize + tokens.bezel.frameThickness * 2,
		BOARD_THICKNESS,
		rows * cellSize + tokens.bezel.frameThickness * 2,
	);
	const baseMat = new THREE.MeshStandardMaterial({
		color: tokens.wood.boardMain,
		roughness: 0.9,
		metalness: 0.05,
	});
	const base = new THREE.Mesh(baseGeom, baseMat);
	base.position.y = -BOARD_THICKNESS / 2;
	base.receiveShadow = true;
	group.add(base);

	// Playfield (rows 1..rows-2) — interior wood, taller along z than wide
	const playfieldDepth = (rows - 2) * cellSize;
	const playfieldGeom = new THREE.PlaneGeometry(
		cols * cellSize,
		playfieldDepth,
		1,
		1,
	);
	playfieldGeom.rotateX(-Math.PI / 2);
	const playfieldMat = new THREE.MeshStandardMaterial({
		...loadPbr(loader, ASSETS.pbr.boardMain, TEXTURE_REPEAT_INTERIOR),
		roughness: 0.85,
		metalness: 0.05,
		displacementScale: 0.012,
	});
	const playfield = new THREE.Mesh(playfieldGeom, playfieldMat);
	playfield.position.y = 0.001;
	playfield.receiveShadow = true;
	group.add(playfield);

	// Home rows — row 0 and row (rows-1). One row deep each. They sit
	// slightly proud of the playfield (delta y of 0.003) so the wood
	// seam between playfield and home row catches a thin shadow line
	// — that's what makes the home rows read as a distinct band.
	//
	// `color` here multiplies the diffuse map: 0.55 grey darkens the
	// PBR walnut so the home wood reads visibly DEEPER than the
	// playfield even on the back row of the board where the camera
	// angle foreshortens it. Without this, real walnut + raking key
	// light reads almost identical to the playfield from the back.
	const homeMat = new THREE.MeshStandardMaterial({
		...loadPbr(loader, ASSETS.pbr.boardHome, TEXTURE_REPEAT_HOME),
		roughness: 0.78,
		metalness: 0.05,
		displacementScale: 0.012,
		color: new THREE.Color(0x808080),
	});
	const homeGeom = new THREE.PlaneGeometry(cols * cellSize, cellSize, 1, 1);
	homeGeom.rotateX(-Math.PI / 2);

	// row 0 — RED's home (the side red pieces are pushing TOWARD as
	// the goal of the game; red occupies rows 1/2/3 at start, white
	// wins by reaching row 0).
	const redHome = new THREE.Mesh(homeGeom, homeMat);
	redHome.position.set(0, 0.005, -((rows - 1) / 2) * cellSize);
	redHome.receiveShadow = true;
	redHome.name = "home-red";
	group.add(redHome);

	// row (rows-1) — WHITE's home.
	const whiteHome = new THREE.Mesh(homeGeom, homeMat);
	whiteHome.position.set(0, 0.005, ((rows - 1) / 2) * cellSize);
	whiteHome.receiveShadow = true;
	whiteHome.name = "home-white";
	group.add(whiteHome);

	// Inset gridlines — thin dark strips slightly proud of the playfield
	// so they catch shadow under raking light from the key directional.
	const gridMat = new THREE.MeshStandardMaterial({
		color: tokens.ink.primary,
		roughness: 0.95,
		metalness: 0,
	});
	const halfX = (cols * cellSize) / 2;
	const halfZ = (rows * cellSize) / 2;
	const gridY = GRIDLINE_HEIGHT / 2 + 0.002;
	for (let i = 0; i <= cols; i++) {
		const x = -halfX + i * cellSize;
		const lineGeom = new THREE.BoxGeometry(
			GRIDLINE_WIDTH,
			GRIDLINE_HEIGHT,
			rows * cellSize,
		);
		const line = new THREE.Mesh(lineGeom, gridMat);
		line.position.set(x, gridY, 0);
		line.castShadow = true;
		group.add(line);
	}
	for (let i = 0; i <= rows; i++) {
		const z = -halfZ + i * cellSize;
		const lineGeom = new THREE.BoxGeometry(
			cols * cellSize,
			GRIDLINE_HEIGHT,
			GRIDLINE_WIDTH,
		);
		const line = new THREE.Mesh(lineGeom, gridMat);
		line.position.set(0, gridY, z);
		line.castShadow = true;
		group.add(line);
	}

	// Bezel — dark-wood frame around the board's perimeter.
	const bezelMat = new THREE.MeshStandardMaterial({
		color: tokens.wood.boardHome,
		roughness: 0.7,
		metalness: 0.1,
	});
	const t = tokens.bezel.frameThickness;
	const d = tokens.bezel.frameDepth;
	const lift = tokens.bezel.frameLift;
	// Two long strips along Z (left + right) and two along X (front + back).
	const longSideGeom = new THREE.BoxGeometry(t, d, rows * cellSize + t * 2);
	const shortSideGeom = new THREE.BoxGeometry(cols * cellSize, d, t);

	const left = new THREE.Mesh(longSideGeom, bezelMat);
	left.position.set(-(halfX + t / 2), lift, 0);
	left.castShadow = true;
	left.receiveShadow = true;
	group.add(left);

	const right = new THREE.Mesh(longSideGeom, bezelMat);
	right.position.set(halfX + t / 2, lift, 0);
	right.castShadow = true;
	right.receiveShadow = true;
	group.add(right);

	const front = new THREE.Mesh(shortSideGeom, bezelMat);
	front.position.set(0, lift, halfZ + t / 2);
	front.castShadow = true;
	front.receiveShadow = true;
	group.add(front);

	const back = new THREE.Mesh(shortSideGeom, bezelMat);
	back.position.set(0, lift, -(halfZ + t / 2));
	back.castShadow = true;
	back.receiveShadow = true;
	group.add(back);

	return {
		group,
		playfield,
		homeRows: [redHome, whiteHome],
	};
}

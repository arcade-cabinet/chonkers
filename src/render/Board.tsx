import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { ASSETS } from "@/assets/manifest";
import { tokens } from "@/design/tokens";

const BOARD_THICKNESS = 0.18;
const SURFACE_LIFT = 0.0008;

/**
 * The 9×11 wood board, assembled from two PBR sets:
 *
 * - `game_board_home` (WoodFloor008) — rows 0 and 10. Visually the
 *   "home rows" the players are pushing toward.
 * - `game_board_main` (WoodFloor007) — rows 1..9. The interior
 *   playfield where actual movement happens.
 *
 * Each region is its own thin slab so the two woods butt cleanly at
 * the row borders. The visible top surface is split, but the underlying
 * structural box stays as one block beneath, so shadows and side
 * faces read continuously.
 */
export function Board() {
	const { cols, rows, cellSize } = tokens.board;
	const width = cols * cellSize;
	const depth = rows * cellSize;

	const main = useTexture({
		diffuse: ASSETS.pbr.boardMain.diffuse,
		normal: ASSETS.pbr.boardMain.normal,
		roughness: ASSETS.pbr.boardMain.roughness,
		ao: ASSETS.pbr.boardMain.ao,
	});

	const home = useTexture({
		diffuse: ASSETS.pbr.boardHome.diffuse,
		normal: ASSETS.pbr.boardHome.normal,
		roughness: ASSETS.pbr.boardHome.roughness,
	});

	useMemo(() => {
		const mainSet = [main.diffuse, main.normal, main.roughness, main.ao];
		for (const t of mainSet) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.repeat.set(2, 2);
			t.anisotropy = 8;
		}
		main.diffuse.colorSpace = THREE.SRGBColorSpace;

		const homeSet = [home.diffuse, home.normal, home.roughness];
		for (const t of homeSet) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.repeat.set(cols, 1);
			t.anisotropy = 8;
		}
		home.diffuse.colorSpace = THREE.SRGBColorSpace;
	}, [main, home, cols]);

	const gridLines = useMemo(
		() => buildGridLines(cols, rows, cellSize),
		[cols, rows, cellSize],
	);

	const homeDepth = cellSize;
	const mainDepth = (rows - 2) * cellSize;
	const homeFrontZ = -depth / 2 + homeDepth / 2;
	const homeBackZ = depth / 2 - homeDepth / 2;

	return (
		<group>
			{/* Structural body — provides the side faces + receives shadows. */}
			<mesh receiveShadow castShadow position={[0, -BOARD_THICKNESS / 2, 0]}>
				<boxGeometry args={[width, BOARD_THICKNESS, depth]} />
				<meshStandardMaterial
					map={main.diffuse}
					normalMap={main.normal}
					roughnessMap={main.roughness}
					aoMap={main.ao}
					roughness={0.85}
					metalness={0}
				/>
			</mesh>

			{/* Front home row (row 0) — WoodFloor008. */}
			<mesh
				receiveShadow
				position={[0, SURFACE_LIFT, homeFrontZ]}
				rotation={[-Math.PI / 2, 0, 0]}
			>
				<planeGeometry args={[width, homeDepth]} />
				<meshStandardMaterial
					map={home.diffuse}
					normalMap={home.normal}
					roughnessMap={home.roughness}
					roughness={0.78}
					metalness={0}
				/>
			</mesh>

			{/* Interior playfield (rows 1..9) — WoodFloor007. */}
			<mesh
				receiveShadow
				position={[0, SURFACE_LIFT, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
			>
				<planeGeometry args={[width, mainDepth]} />
				<meshStandardMaterial
					map={main.diffuse}
					normalMap={main.normal}
					roughnessMap={main.roughness}
					aoMap={main.ao}
					roughness={0.85}
					metalness={0}
				/>
			</mesh>

			{/* Back home row (row 10) — WoodFloor008. */}
			<mesh
				receiveShadow
				position={[0, SURFACE_LIFT, homeBackZ]}
				rotation={[-Math.PI / 2, 0, 0]}
			>
				<planeGeometry args={[width, homeDepth]} />
				<meshStandardMaterial
					map={home.diffuse}
					normalMap={home.normal}
					roughnessMap={home.roughness}
					roughness={0.78}
					metalness={0}
				/>
			</mesh>

			{/* Engraved gridlines — thin dark line segments inset slightly above the surface. */}
			<lineSegments position={[0, SURFACE_LIFT * 2, 0]}>
				<bufferGeometry attach="geometry" {...gridLines} />
				<lineBasicMaterial
					color={tokens.ink.primary}
					transparent
					opacity={0.55}
				/>
			</lineSegments>
		</group>
	);
}

function buildGridLines(
	cols: number,
	rows: number,
	cell: number,
): { attributes: { position: THREE.BufferAttribute } } {
	const halfW = (cols * cell) / 2;
	const halfD = (rows * cell) / 2;
	const positions: number[] = [];

	for (let c = 0; c <= cols; c++) {
		const x = -halfW + c * cell;
		positions.push(x, 0, -halfD, x, 0, halfD);
	}
	for (let r = 0; r <= rows; r++) {
		const z = -halfD + r * cell;
		positions.push(-halfW, 0, z, halfW, 0, z);
	}

	const attribute = new THREE.BufferAttribute(new Float32Array(positions), 3);
	return { attributes: { position: attribute } };
}

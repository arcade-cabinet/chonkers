/**
 * Lobby demo pucks — two pucks (one red, one white) sitting on the
 * board centre during the title state. They serve as the anchors
 * for the lobby Play / Resume diegetic affordances.
 *
 * The pucks are real THREE.Mesh instances; the affordance SVGs
 * track them via camera.project() through the same mountOverlay
 * primitive used by every other diegetic surface.
 */

import * as THREE from "three";
import { tokens } from "@/design";
import type { PieceMaterials } from "./pieces";

export interface DemoPucksHandle {
	readonly group: THREE.Group;
	readonly redPuck: THREE.Mesh;
	readonly whitePuck: THREE.Mesh;
	dispose(): void;
}

export function buildDemoPucks(materials: PieceMaterials): DemoPucksHandle {
	const { cellSize, puckRadius, puckHeight } = tokens.board;
	const group = new THREE.Group();
	group.name = "demo-pucks";

	const geom = new THREE.CylinderGeometry(
		puckRadius * cellSize,
		puckRadius * cellSize,
		puckHeight * cellSize,
		32,
	);

	const redPuck = new THREE.Mesh(geom, materials.red);
	redPuck.name = "demo-red";
	redPuck.castShadow = true;
	redPuck.receiveShadow = true;
	// Centre the red puck slightly left of board origin.
	redPuck.position.set(-1.2, (puckHeight * cellSize) / 2 + 0.025, 0);
	group.add(redPuck);

	const whitePuck = new THREE.Mesh(geom, materials.white);
	whitePuck.name = "demo-white";
	whitePuck.castShadow = true;
	whitePuck.receiveShadow = true;
	whitePuck.position.set(1.2, (puckHeight * cellSize) / 2 + 0.025, 0);
	group.add(whitePuck);

	function dispose(): void {
		geom.dispose();
		group.remove(redPuck);
		group.remove(whitePuck);
	}

	return { group, redPuck, whitePuck, dispose };
}

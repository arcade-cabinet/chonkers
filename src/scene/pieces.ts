/**
 * Piece rendering — one THREE.Group per occupied cell, each holding
 * the puck meshes for that stack.
 *
 * `PiecePlacement` is the engine's per-piece snapshot: a single
 * (col, row, height-index, color) tuple. A stack of N pucks at
 * (col, row) appears in `Match.pieces` as N separate placements
 * with the same col/row but height-indices 0..N-1. We group by
 * cell and render one puck per placement at its own height level.
 *
 * Per docs/DESIGN.md §"The pieces": pucks are short cylinders with
 * radius : height ≈ 1 : 0.4. Each puck shows its own owner's wood
 * (Wood008 for red, Wood031 for white) — visual continuity with
 * what was chonked under whom. The TOP piece's colour is what
 * controls the stack per RULES.md §4.3, but the geometry shows
 * the full ownership history vertically.
 */

import * as THREE from "three";
import { tokens } from "@/design";
import type { PiecePlacement } from "@/sim/traits";
import { assetUrl } from "@/utils/assetUrl";
import { ASSETS } from "@/utils/manifest";

interface PiecePbr {
	readonly diffuse: string;
	readonly normal: string;
	readonly roughness: string;
	readonly displacement: string;
}

function loadPieceMaterial(set: PiecePbr): THREE.MeshStandardMaterial {
	const loader = new THREE.TextureLoader();
	const apply = (tex: THREE.Texture) => {
		tex.wrapS = THREE.RepeatWrapping;
		tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(1, 1);
		return tex;
	};
	const diffuse = apply(loader.load(assetUrl(set.diffuse)));
	diffuse.colorSpace = THREE.SRGBColorSpace;
	return new THREE.MeshStandardMaterial({
		map: diffuse,
		normalMap: apply(loader.load(assetUrl(set.normal))),
		roughnessMap: apply(loader.load(assetUrl(set.roughness))),
		displacementMap: apply(loader.load(assetUrl(set.displacement))),
		displacementScale: 0,
		roughness: 0.7,
		metalness: 0.05,
	});
}

export interface PieceMaterials {
	readonly red: THREE.MeshStandardMaterial;
	readonly white: THREE.MeshStandardMaterial;
}

export function loadPieceMaterials(): PieceMaterials {
	return {
		red: loadPieceMaterial(ASSETS.pbr.redPiece),
		white: loadPieceMaterial(ASSETS.pbr.whitePiece),
	};
}

export interface PiecesHandles {
	readonly group: THREE.Group;
	/**
	 * Update the piece group to match a `PiecePlacement[]` snapshot.
	 * Idempotent — call from a koota subscription on every change to
	 * `Match.pieces`. Existing meshes are re-used when the cell key
	 * matches; geometry/material allocation only happens for new cells.
	 */
	sync(placements: ReadonlyArray<PiecePlacement>): void;
	/**
	 * Return the THREE.Object3D representing the TOP puck of the
	 * stack at (col, row), or null if no stack is present. Used by
	 * the splitting radial to anchor its SVG via camera.project().
	 */
	topPuckAt(col: number, row: number): THREE.Object3D | null;
	/** Dispose all GPU resources. Call from HMR cleanup. */
	dispose(): void;
}

const STACK_KEY = (col: number, row: number) => `${col},${row}`;

export function buildPieces(materials: PieceMaterials): PiecesHandles {
	const { cols, rows, cellSize, puckRadius, puckHeight, puckGap } =
		tokens.board;
	const halfX = (cols * cellSize) / 2 - cellSize / 2;
	const halfZ = (rows * cellSize) / 2 - cellSize / 2;

	const group = new THREE.Group();
	group.name = "pieces";

	const puckGeom = new THREE.CylinderGeometry(
		puckRadius * cellSize,
		puckRadius * cellSize,
		puckHeight * cellSize,
		32,
	);

	const stacks = new Map<string, THREE.Group>();

	function buildStack(
		col: number,
		row: number,
		levels: ReadonlyArray<PiecePlacement>,
	): THREE.Group {
		const stack = new THREE.Group();
		stack.name = `stack:${col},${row}`;
		const x = -halfX + col * cellSize;
		const z = -halfZ + row * cellSize;
		stack.position.set(x, 0, z);

		const stride = puckHeight * cellSize + puckGap;
		// Sort by height-index so puck 0 is at the bottom.
		const sorted = [...levels].sort((a, b) => a.height - b.height);
		for (const piece of sorted) {
			const mat = piece.color === "red" ? materials.red : materials.white;
			const puck = new THREE.Mesh(puckGeom, mat);
			puck.castShadow = true;
			puck.receiveShadow = true;
			puck.position.y =
				piece.height * stride + (puckHeight * cellSize) / 2 + 0.025;
			stack.add(puck);
		}
		return stack;
	}

	function signatureFor(levels: ReadonlyArray<PiecePlacement>): string {
		// Deterministic signature for re-use detection. height + color
		// per level, sorted by height-index.
		const sorted = [...levels].sort((a, b) => a.height - b.height);
		return sorted.map((p) => `${p.height}:${p.color}`).join("|");
	}

	function sync(placements: ReadonlyArray<PiecePlacement>): void {
		// Group by cell (col, row).
		const byCell = new Map<string, PiecePlacement[]>();
		for (const p of placements) {
			const key = STACK_KEY(p.col, p.row);
			const list = byCell.get(key);
			if (list) {
				list.push(p);
			} else {
				byCell.set(key, [p]);
			}
		}

		const seen = new Set<string>();
		for (const [key, levels] of byCell) {
			seen.add(key);
			const sig = signatureFor(levels);
			const existing = stacks.get(key);
			if (existing && existing.userData.signature === sig) continue;
			if (existing) {
				group.remove(existing);
				stacks.delete(key);
			}
			const first = levels[0];
			if (!first) continue;
			const stack = buildStack(first.col, first.row, levels);
			stack.userData.signature = sig;
			stacks.set(key, stack);
			group.add(stack);
		}
		for (const [key, stack] of stacks) {
			if (!seen.has(key)) {
				group.remove(stack);
				stacks.delete(key);
			}
		}
	}

	function topPuckAt(col: number, row: number): THREE.Object3D | null {
		const stack = stacks.get(STACK_KEY(col, row));
		if (!stack) return null;
		// The buildStack loop sorts by height-index ascending, so the
		// last child is the highest puck — i.e. the top of the stack.
		const last = stack.children[stack.children.length - 1];
		return last ?? null;
	}

	function dispose(): void {
		puckGeom.dispose();
		materials.red.dispose();
		materials.white.dispose();
		for (const stack of stacks.values()) {
			group.remove(stack);
		}
		stacks.clear();
	}

	return { group, sync, topPuckAt, dispose };
}

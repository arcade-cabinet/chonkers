/**
 * Two demo pieces shown in the lobby state — one red on the left
 * of the axle, one white on the right. Each piece carries a
 * RadialOverlay (the unified piece-top primitive from PRQ-A1) on
 * its top cap: the red piece's overlay shows ▶ Play, the white
 * piece's shows ⏩ Resume. Tapping the play wedge starts a new
 * match; tapping the resume wedge resumes the latest persisted
 * match. The overlay's `<button>` per wedge gives screen readers
 * + keyboard nav + the golden-path Playwright spec a real aria
 * handle (no R3F `onClick` mesh hack).
 *
 * When ceremony enters the "demo-clearing" phase, the demo pieces
 * lift up out of frame (Y rises, opacity fades) before the actual
 * gameplay pieces start placing. Reads as "the table being cleared
 * before the match is set up." The radial overlays fade with their
 * pieces.
 */

import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useTrait } from "koota/react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";
import { Ceremony } from "@/sim";
import { ASSETS } from "@/utils/manifest";
import { useWorldEntity } from "../hooks/useWorldEntity";
import { RadialOverlay } from "./RadialOverlay";

const LIFT_DURATION_MS = 700;
const LIFT_HEIGHT = 6.0;
const REST_X = 1.6;

interface Props {
	readonly onPlay: () => void;
	readonly onResume: () => void;
	readonly canResume: boolean;
}

export function DemoPieces({ onPlay, onResume, canResume }: Props) {
	const worldEntity = useWorldEntity();
	const ceremony = useTrait(worldEntity, Ceremony);
	const phase = ceremony?.phase ?? "idle";
	const startedAtMs = ceremony?.startedAtMs ?? 0;

	const red = useTexture({
		diffuse: ASSETS.pbr.redPiece.diffuse,
		normal: ASSETS.pbr.redPiece.normal,
		roughness: ASSETS.pbr.redPiece.roughness,
	});
	const white = useTexture({
		diffuse: ASSETS.pbr.whitePiece.diffuse,
		normal: ASSETS.pbr.whitePiece.normal,
		roughness: ASSETS.pbr.whitePiece.roughness,
	});

	useMemo(() => {
		for (const t of [red.diffuse, red.normal, red.roughness]) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.anisotropy = 8;
		}
		red.diffuse.colorSpace = THREE.SRGBColorSpace;
		for (const t of [white.diffuse, white.normal, white.roughness]) {
			t.wrapS = THREE.RepeatWrapping;
			t.wrapT = THREE.RepeatWrapping;
			t.anisotropy = 8;
		}
		white.diffuse.colorSpace = THREE.SRGBColorSpace;
	}, [red, white]);

	const { puckRadius, puckHeight } = tokens.board;
	const r = puckRadius * 1.6;
	const h = puckHeight * 1.6;
	const baseY = h / 2;

	const redRef = useRef<THREE.Mesh | null>(null);
	const whiteRef = useRef<THREE.Mesh | null>(null);
	const redMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
	const whiteMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

	useFrame(() => {
		const lifting = phase === "demo-clearing";
		const cleared =
			phase === "placing-first" ||
			phase === "placing-second" ||
			phase === "coin-flip" ||
			phase === "settling";
		// Compute lift progress: 0 at lobby/rest, 0..1 during clearing,
		// 1 once cleared (and beyond — the meshes are invisible).
		let progress = 0;
		if (lifting) {
			const elapsed = performance.now() - startedAtMs;
			progress = Math.max(0, Math.min(1, elapsed / LIFT_DURATION_MS));
		} else if (cleared) {
			progress = 1;
		}
		const eased = easeInQuad(progress);
		const liftY = eased * LIFT_HEIGHT;
		const opacity = 1 - eased;
		if (redRef.current) redRef.current.position.y = baseY + liftY;
		if (whiteRef.current) whiteRef.current.position.y = baseY + liftY;
		if (redMatRef.current) {
			redMatRef.current.opacity = opacity;
			redMatRef.current.transparent = opacity < 1;
		}
		if (whiteMatRef.current) {
			whiteMatRef.current.opacity = opacity;
			whiteMatRef.current.transparent = opacity < 1;
		}
	});

	// Hide entirely once cleared so the meshes don't sit invisible
	// in the scene tree consuming raycaster cycles.
	if (
		phase === "placing-first" ||
		phase === "placing-second" ||
		phase === "coin-flip" ||
		phase === "settling"
	) {
		return null;
	}

	const interactive = phase === "idle";

	// Top of each puck (where the radial overlay sits) — anchor the
	// drei `<Html>` at this Y so the SVG ring projects right above
	// the wood cap, not buried inside the cylinder geometry.
	const topY = baseY + h / 2 + 0.001;

	return (
		<group>
			<mesh
				ref={redRef}
				position={[-REST_X, baseY, 0]}
				castShadow
				receiveShadow
			>
				<cylinderGeometry args={[r, r, h, 64]} />
				<meshStandardMaterial
					ref={redMatRef}
					map={red.diffuse}
					normalMap={red.normal}
					roughnessMap={red.roughness}
					roughness={0.7}
					metalness={0}
				/>
			</mesh>
			{interactive ? (
				<RadialOverlay
					position={[-REST_X, topY, 0]}
					slices={1}
					outerRadius={64}
					innerRadius={0}
					slotContent={() => <PlayGlyph />}
					slotLabel={() => "Play new match"}
					onSelectSlice={() => onPlay()}
				/>
			) : null}
			<mesh
				ref={whiteRef}
				position={[REST_X, baseY, 0]}
				castShadow
				receiveShadow
			>
				<cylinderGeometry args={[r, r, h, 64]} />
				<meshStandardMaterial
					ref={whiteMatRef}
					map={white.diffuse}
					normalMap={white.normal}
					roughnessMap={white.roughness}
					roughness={0.7}
					metalness={0}
				/>
			</mesh>
			{interactive ? (
				<RadialOverlay
					position={[REST_X, topY, 0]}
					slices={1}
					outerRadius={64}
					innerRadius={0}
					slotContent={() => <ResumeGlyph disabled={!canResume} />}
					slotLabel={() =>
						canResume ? "Resume match" : "Resume match (none saved)"
					}
					onSelectSlice={canResume ? () => onResume() : undefined}
				/>
			) : null}
		</group>
	);
}

/**
 * ▶ glyph — solid right-pointing triangle, centred at (0,0) so the
 * RadialOverlay's `slotContent` translate places it correctly.
 */
function PlayGlyph(): React.ReactElement {
	// The parent <button> in RadialOverlay already exposes the
	// accessible name; this SVG glyph is decorative-by-default
	// (no role, no tabindex, no aria attributes — assistive tech
	// reads the button label, not the path).
	return (
		<g>
			<path
				d="M -10 -14 L -10 14 L 16 0 Z"
				fill={tokens.ink.inverse}
				stroke={tokens.ink.primary}
				strokeWidth={1.5}
				strokeLinejoin="round"
			/>
		</g>
	);
}

/**
 * ⏩ glyph — two right-pointing triangles for fast-forward.
 */
function ResumeGlyph({
	disabled,
}: {
	readonly disabled: boolean;
}): React.ReactElement {
	const fill = disabled ? "#6b5e4d" : tokens.ink.primary;
	// Decorative — see PlayGlyph for the rationale.
	return (
		<g opacity={disabled ? 0.5 : 1}>
			<path
				d="M -16 -12 L -16 12 L -2 0 Z"
				fill={fill}
				stroke={tokens.ink.primary}
				strokeWidth={1}
				strokeLinejoin="round"
			/>
			<path
				d="M 0 -12 L 0 12 L 14 0 Z"
				fill={fill}
				stroke={tokens.ink.primary}
				strokeWidth={1}
				strokeLinejoin="round"
			/>
		</g>
	);
}

function easeInQuad(t: number): number {
	return t * t;
}

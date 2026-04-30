/**
 * Bezel-inlaid icon buttons for the lobby view.
 *
 * Two buttons sit recessed in the FRONT bezel slab (the slab
 * closest to the viewer):
 *   - ▶ Play  — start a new match. Always enabled.
 *   - ⏩ Resume — pick up the latest persisted match. Disabled
 *     visually + interactively when no saved match exists.
 *
 * Each button is a small pill of the same dark wood as the bezel,
 * with an emissive icon mesh sitting in its center. Disabled
 * state knocks emissive intensity to 0 + opacity to 0.4.
 *
 * Hover/tap responses ride a useFrame-driven scale lerp so the
 * buttons feel physical without animation libs.
 */

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import { tokens } from "@/design/tokens";

const FRONT_SLAB_Z_OFFSET = 0.02; // sit just above the bezel slab top

interface Props {
	readonly innerDepth: number;
	readonly frameThickness: number;
	readonly canResume: boolean;
	readonly onPlay: () => void;
	readonly onResume: () => void;
}

export function BezelButtons({
	innerDepth,
	frameThickness,
	canResume,
	onPlay,
	onResume,
}: Props) {
	const slabZ = innerDepth / 2 + frameThickness / 2;
	const buttonY = 0.2 + FRONT_SLAB_Z_OFFSET;
	const playX = -1.2;
	const resumeX = 1.2;

	return (
		<group>
			<BezelIconButton
				position={[playX, buttonY, slabZ]}
				icon="play"
				enabled
				onTap={onPlay}
			/>
			<BezelIconButton
				position={[resumeX, buttonY, slabZ]}
				icon="resume"
				enabled={canResume}
				onTap={onResume}
			/>
		</group>
	);
}

interface ButtonProps {
	readonly position: [number, number, number];
	readonly icon: "play" | "resume";
	readonly enabled: boolean;
	readonly onTap: () => void;
}

function BezelIconButton({ position, icon, enabled, onTap }: ButtonProps) {
	const groupRef = useRef<THREE.Group | null>(null);
	const [hovered, setHovered] = useState(false);
	const targetScale = enabled ? (hovered ? 1.08 : 1.0) : 0.92;

	useFrame((_, delta) => {
		const g = groupRef.current;
		if (!g) return;
		const t = 1 - Math.exp(-12 * delta);
		const cur = g.scale.x;
		const next = cur + (targetScale - cur) * t;
		g.scale.set(next, next, next);
	});

	const handleClick = (e: ThreeEvent<MouseEvent>) => {
		e.stopPropagation();
		if (!enabled) return;
		onTap();
	};

	const accent = enabled ? tokens.accent.select : tokens.ink.inverse;
	const opacity = enabled ? 1 : 0.35;
	const emissiveIntensity = enabled ? (hovered ? 1.4 : 1.0) : 0;

	return (
		<group ref={groupRef} position={position}>
			{/* Pill body — slightly raised dark wood disc */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: <mesh> is R3F three.js, not DOM. */}
			<mesh
				castShadow
				receiveShadow
				onClick={handleClick}
				onPointerOver={(e) => {
					e.stopPropagation();
					if (enabled) setHovered(true);
				}}
				onPointerOut={() => setHovered(false)}
			>
				<cylinderGeometry args={[0.42, 0.42, 0.12, 48]} />
				<meshStandardMaterial
					color={tokens.wood.boardHome}
					roughness={0.7}
					metalness={0}
					transparent
					opacity={opacity}
				/>
			</mesh>
			{/* Icon — flat extruded shape sitting on top of the pill */}
			<mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				{icon === "play" ? <PlayIconGeometry /> : <ResumeIconGeometry />}
				<meshStandardMaterial
					color={accent}
					emissive={accent}
					emissiveIntensity={emissiveIntensity}
					toneMapped={false}
					transparent
					opacity={opacity}
				/>
			</mesh>
		</group>
	);
}

function PlayIconGeometry() {
	// Solid right-pointing triangle in XZ plane (already rotated to Y-up)
	const shape = new THREE.Shape();
	shape.moveTo(-0.16, -0.2);
	shape.lineTo(-0.16, 0.2);
	shape.lineTo(0.22, 0);
	shape.closePath();
	return <shapeGeometry args={[shape]} />;
}

function ResumeIconGeometry() {
	// Two right-pointing triangles for fast-forward
	const left = new THREE.Shape();
	left.moveTo(-0.24, -0.18);
	left.lineTo(-0.24, 0.18);
	left.lineTo(0.0, 0);
	left.closePath();
	const right = new THREE.Shape();
	right.moveTo(0.02, -0.18);
	right.lineTo(0.02, 0.18);
	right.lineTo(0.26, 0);
	right.closePath();
	return <shapeGeometry args={[[left, right]]} />;
}

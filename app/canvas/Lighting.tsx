/**
 * Lighting rig for the Chonkers board.
 *
 * The HDRI in <Environment> already provides ambient + reflections;
 * we add a key + rim to anchor the wood texture and cast piece
 * shadows on the board surface.
 */
export function Lighting() {
	return (
		<>
			<ambientLight intensity={0.25} />
			<directionalLight
				position={[6, 10, 5]}
				intensity={1.6}
				castShadow
				shadow-mapSize={[2048, 2048]}
				shadow-camera-near={0.5}
				shadow-camera-far={30}
				shadow-camera-left={-8}
				shadow-camera-right={8}
				shadow-camera-top={8}
				shadow-camera-bottom={-8}
				shadow-bias={-0.0005}
			/>
			<directionalLight position={[-4, 6, -6]} intensity={0.4} />
		</>
	);
}

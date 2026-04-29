import { useState } from "react";
import { Scene } from "./canvas/Scene";
import { TitleScreen } from "./screens/TitleScreen";

export function App() {
	const [started, setStarted] = useState(false);

	return (
		<>
			<Scene />
			{!started ? <TitleScreen onStart={() => setStarted(true)} /> : null}
		</>
	);
}

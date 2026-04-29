import { useState } from "react";
import { Scene } from "./render/Scene";
import { TitleScreen } from "./ui/TitleScreen";

export function App() {
	const [started, setStarted] = useState(false);

	return (
		<>
			<Scene />
			{!started ? <TitleScreen onStart={() => setStarted(true)} /> : null}
		</>
	);
}

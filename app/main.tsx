import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { radixTheme } from "@/design/theme";
import { App } from "./App";
import "./css/style.css";
import "./css/fonts.css";

const container = document.getElementById("root");
if (!container) {
	throw new Error("#root element missing from index.html");
}

createRoot(container).render(
	<StrictMode>
		<Theme {...radixTheme}>
			<App />
		</Theme>
	</StrictMode>,
);

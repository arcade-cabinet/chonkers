import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { radixTheme } from "@/design/theme";
import { App } from "./App";
import { type BootResult, boot, ErrorBoundary, SimProvider } from "./boot";
import "./css/style.css";
import "./css/fonts.css";

function BootGate() {
	const [result, setResult] = useState<BootResult | null>(null);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		boot()
			.then((r) => {
				if (cancelled) {
					void r.dispose();
					return;
				}
				setResult(r);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err : new Error(String(err)));
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		// Re-throw so the surrounding ErrorBoundary catches it.
		throw error;
	}
	if (!result) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100vh",
				}}
			>
				Loading…
			</div>
		);
	}

	return (
		<SimProvider boot={result}>
			<App />
		</SimProvider>
	);
}

const container = document.getElementById("root");
if (!container) {
	throw new Error("#root element missing from index.html");
}

createRoot(container).render(
	<StrictMode>
		<Theme {...radixTheme}>
			<ErrorBoundary>
				<Suspense fallback={null}>
					<BootGate />
				</Suspense>
			</ErrorBoundary>
		</Theme>
	</StrictMode>,
);

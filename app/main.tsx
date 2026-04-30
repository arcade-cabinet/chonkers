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
		let bootResult: BootResult | null = null;
		boot()
			.then((r) => {
				bootResult = r;
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
			// Dispose on unmount so the Capacitor App lifecycle
			// listener doesn't accumulate across HMR reloads in dev
			// or component remounts in production. If boot hasn't
			// resolved yet, the cancelled flag will trigger the
			// dispose inside the .then handler.
			if (bootResult) void bootResult.dispose();
		};
	}, []);

	if (error) {
		// Re-throw so the surrounding ErrorBoundary catches it.
		throw error;
	}
	if (!result) {
		return (
			<div
				role="status"
				aria-live="polite"
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

import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { radixTheme } from "@/design/theme";
import { App } from "./App";
import { type BootResult, boot, ErrorBoundary, SimProvider } from "./boot";
import { installFonts } from "./css/fonts";
import "./css/style.css";

installFonts();

// Global single-flight guard: React 19 StrictMode double-mounts
// the BootGate effect, which previously caused boot() to run twice
// — creating two separate koota worlds. The koota onChange/set
// pipeline keys subscriptions on the world's id, so the App tree
// could subscribe to world A's Screen while broker actions
// mutated world B's Screen, breaking the lobby → play transition.
//
// Caching the boot promise globally guarantees a single boot per
// page lifetime regardless of StrictMode mount cycles. The
// dispose path is moved to a `beforeunload` handler so the
// Capacitor lifecycle listener still cleans up at app teardown.
let bootPromise: Promise<BootResult> | null = null;
function getBoot(): Promise<BootResult> {
	if (!bootPromise) bootPromise = boot();
	return bootPromise;
}

function BootGate() {
	const [result, setResult] = useState<BootResult | null>(null);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		getBoot()
			.then((r) => {
				if (cancelled) return;
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

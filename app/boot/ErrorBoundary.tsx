/**
 * Top-level error boundary. Catches:
 *   - Boot rejections (database bootstrap, audio preload, sim init).
 *   - React render-time errors in any descendant.
 *
 * The recovery UI offers a single "Reload" button that hard-refreshes
 * the page. We deliberately don't try to retry inline because most
 * boot failures are environmental (kv unavailable, OPFS quota,
 * Capacitor plugin missing) and need a real reload to clear.
 */

import {
	Button,
	Callout,
	Container,
	Flex,
	Heading,
	Text,
} from "@radix-ui/themes";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	readonly children: ReactNode;
}

interface State {
	readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("[chonkers] caught error", error, info);
	}

	render(): ReactNode {
		if (!this.state.error) return this.props.children;
		// Production builds show a generic message — exposing raw
		// error.message to end-users can leak internal type names,
		// stack frames, or environmental details that aren't useful
		// to them and may surface implementation we didn't intend
		// to disclose. Dev mode shows the full message so debugging
		// stays painless.
		const message = import.meta.env.DEV
			? this.state.error.message || String(this.state.error)
			: "An unexpected error occurred while starting the app.";
		return (
			<Container size="2" p="6">
				<Flex direction="column" gap="4">
					<Heading size="6">Something went wrong</Heading>
					<Callout.Root color="red">
						<Callout.Text>{message}</Callout.Text>
					</Callout.Root>
					<Text size="2" color="gray">
						Reloading the page typically resolves boot-time errors. If the
						problem persists after a reload, your browser may be blocking
						storage (private browsing) or running out of quota.
					</Text>
					<Flex gap="3">
						<Button onClick={() => window.location.reload()}>Reload</Button>
					</Flex>
				</Flex>
			</Container>
		);
	}
}

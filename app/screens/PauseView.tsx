/**
 * Pause screen — the play state with the gameplay frozen + a
 * translucent scrim + Resume CTA. Reached only on native when
 * the app backgrounds mid-match (boot.ts wires the lifecycle
 * listener).
 *
 * The same Scene mounts behind the scrim so resume is a continuous
 * shot — no canvas teardown/rebuild on a foreground transition.
 */

import { Box, Button, Flex, Heading } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { tokens } from "@/design/tokens";
import { useSimActions } from "../boot";
import { CanvasHandlersProvider } from "../canvas/CellClickContext";
import { Scene } from "../canvas/Scene";

export function PauseView() {
	const actions = useSimActions();
	return (
		<Box
			style={{
				position: "relative",
				width: "100vw",
				height: "100vh",
				overflow: "hidden",
			}}
		>
			<CanvasHandlersProvider
				value={{ onCellClick: () => {}, onForfeit: () => {} }}
			>
				<Scene />
			</CanvasHandlersProvider>
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.18 }}
				style={{
					position: "absolute",
					inset: 0,
					background: "rgba(15,10,5,0.78)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Flex direction="column" align="center" gap="5">
					<Heading
						as="h1"
						size="8"
						color="amber"
						style={{ fontFamily: tokens.font.display }}
					>
						Paused
					</Heading>
					<Button
						size="4"
						color="amber"
						variant="solid"
						onClick={() => actions.setScreen("play")}
					>
						Resume
					</Button>
				</Flex>
			</motion.div>
		</Box>
	);
}

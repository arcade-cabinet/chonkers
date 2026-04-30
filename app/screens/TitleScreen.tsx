import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { tokens } from "@/design/tokens";
import { useSimActions } from "../boot";

/**
 * Title screen: Abril Fatface display name over the live board,
 * Lato body text, framer-motion fade-in. The 3D scene continues
 * rendering behind the scrim.
 *
 * Pulls `newMatch` from the sim actions context. PRQ-4 follow-up
 * commits will add difficulty/disposition/colour selectors here;
 * for now "New game" launches an AI-vs-AI balanced-easy match so
 * the rest of the shell can be exercised end-to-end.
 */
export function TitleScreen() {
	const actions = useSimActions();

	const onStart = () => {
		void actions.newMatch({
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			humanColor: null,
		});
	};
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: tokens.motion.modalMs / 1000, ease: "easeOut" }}
			style={{
				position: "absolute",
				inset: 0,
				background: tokens.surface.scrim,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				pointerEvents: "auto",
			}}
		>
			<Flex
				direction="column"
				align="center"
				gap="6"
				style={{ maxWidth: 480, padding: "0 24px" }}
			>
				<Box>
					<motion.div
						initial={{ y: 16, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						transition={{ delay: 0.05, duration: 0.32, ease: "easeOut" }}
					>
						<Heading
							as="h1"
							size="9"
							align="center"
							style={{
								fontFamily: tokens.font.display,
								letterSpacing: "0.02em",
							}}
						>
							Chonkers
						</Heading>
					</motion.div>
					<motion.div
						initial={{ y: 8, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						transition={{ delay: 0.18, duration: 0.32, ease: "easeOut" }}
					>
						<Text
							size="4"
							align="center"
							as="p"
							color="amber"
							style={{ marginTop: 8 }}
						>
							Stack. Don't capture.
						</Text>
					</motion.div>
				</Box>

				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.32, duration: 0.32 }}
				>
					<Button size="4" onClick={onStart} variant="solid" color="amber">
						New game
					</Button>
				</motion.div>
			</Flex>
		</motion.div>
	);
}

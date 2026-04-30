/**
 * Shared shell for the three terminal screens (Win / Lose /
 * SpectatorResult). Each variant is a thin wrapper passing a
 * different headline + accent.
 *
 * The "Play again" button calls quitMatch + immediately starts a
 * new match with the same profiles + humanColor. "Main menu"
 * just calls quitMatch and lets the title screen handle the next
 * match config. Both buttons resolve the dead-end the prior
 * commit's bare placeholder created.
 */

import { Button, Container, Flex, Heading, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { useTrait } from "koota/react";
import { useCallback, useState } from "react";
import { Match } from "@/sim";
import { useSimActions } from "../boot";
import { useWorldEntity } from "../hooks/useWorldEntity";

interface Variant {
	readonly headline: string;
	readonly subhead: string;
	readonly accent: "amber" | "red" | "gray";
}

const VARIANTS: Record<"win" | "lose" | "spectator", Variant> = {
	win: { headline: "You win", subhead: "Tower carried home.", accent: "amber" },
	lose: {
		headline: "You lose",
		subhead: "Better luck next round.",
		accent: "red",
	},
	spectator: {
		headline: "Match complete",
		subhead: "AI vs AI demo finished.",
		accent: "gray",
	},
};

interface Props {
	readonly variant: "win" | "lose" | "spectator";
}

export function EndScreen({ variant }: Props) {
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	const actions = useSimActions();
	// Re-entrancy guard: repeated clicks on Play again could
	// queue overlapping quitMatch + newMatch sequences and race
	// the screen transition. The buttons disable while busy so
	// double-tap is a no-op.
	const [busy, setBusy] = useState(false);

	const v = VARIANTS[variant];

	const onPlayAgain = useCallback(() => {
		if (busy) return;
		if (!match) {
			void actions.setScreen("title");
			return;
		}
		// Capture the prior config locally before quitMatch wipes
		// the trait, then immediately start a fresh match with the
		// same setup.
		const config = {
			redProfile: match.redProfile,
			whiteProfile: match.whiteProfile,
			humanColor: match.humanColor,
		} as const;
		setBusy(true);
		void (async () => {
			try {
				await actions.quitMatch();
				await actions.newMatch(config);
			} finally {
				setBusy(false);
			}
		})();
	}, [actions, busy, match]);

	const onMainMenu = useCallback(() => {
		if (busy) return;
		void actions.quitMatch();
	}, [actions, busy]);

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
			style={{
				position: "absolute",
				inset: 0,
				background: "rgba(15,10,5,0.85)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Container size="1">
				<Flex direction="column" align="center" gap="5">
					<Heading
						as="h1"
						size="9"
						color={v.accent}
						style={{ fontFamily: "var(--ck-font-display, serif)" }}
					>
						{v.headline}
					</Heading>
					<Text size="3" color="gray">
						{v.subhead}
					</Text>
					<Flex gap="3" mt="3">
						<Button
							size="3"
							color={v.accent}
							onClick={onPlayAgain}
							disabled={busy}
						>
							Play again
						</Button>
						<Button
							size="3"
							variant="soft"
							onClick={onMainMenu}
							disabled={busy}
						>
							Main menu
						</Button>
					</Flex>
				</Flex>
			</Container>
		</motion.div>
	);
}

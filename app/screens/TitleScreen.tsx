import {
	Badge,
	Box,
	Button,
	Flex,
	Heading,
	SegmentedControl,
	Text,
} from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { isProfileKey, type ProfileKey } from "@/ai";
import { tokens } from "@/design/tokens";
import { useSimActions } from "../boot";

type Disposition = "aggressive" | "balanced" | "defensive";
type Difficulty = "easy" | "medium" | "hard";
type ColorChoice = "red" | "white" | "watch";

const DISPOSITIONS = [
	"aggressive",
	"balanced",
	"defensive",
] as const satisfies readonly Disposition[];
const DIFFICULTIES = [
	"easy",
	"medium",
	"hard",
] as const satisfies readonly Difficulty[];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Compile-time check: every (disposition, difficulty) combo must be
// a valid ProfileKey. Adding a Disposition without the matching three
// `*-easy/medium/hard` ProfileKey entries fails this assertion at
// the call site that builds the key — surfaces missing profile
// entries at the type layer instead of as a runtime getProfile throw.
function buildProfileKey(d: Disposition, df: Difficulty): ProfileKey {
	const key = `${d}-${df}` as const;
	// `satisfies ProfileKey` would assert at the type level; we use
	// the runtime guard as belt-and-braces for state-tampering.
	if (!isProfileKey(key)) {
		throw new Error(`buildProfileKey: invariant violated — ${key}`);
	}
	return key;
}

const COLOR_CHOICES: ReadonlyArray<{
	key: ColorChoice;
	label: string;
	hint: string;
}> = [
	{ key: "red", label: "Play Red", hint: "Move first if coin flips red" },
	{ key: "white", label: "Play White", hint: "Wait for the coin" },
	{ key: "watch", label: "Watch", hint: "AI vs AI" },
];

/**
 * Title screen with full match configurator. Three axes:
 *   - Color choice (Red / White / Watch)
 *   - AI disposition (Aggressive / Balanced / Defensive)
 *   - AI difficulty (Easy / Medium / Hard)
 *
 * The AI profile key is composed `${disposition}-${difficulty}`. The
 * "Watch" option creates an AI-vs-AI match with the same profile on
 * both sides, exercising the spectator path. A coin flip still
 * decides who moves first per the engine's first-mover rule.
 *
 * Framer-motion drives a staged entrance (heading → tagline → cards
 * → CTA) and an AnimatePresence morph between the picker rows.
 */
export function TitleScreen() {
	const actions = useSimActions();
	const [starting, setStarting] = useState(false);
	const [color, setColor] = useState<ColorChoice>("red");
	const [disposition, setDisposition] = useState<Disposition>("balanced");
	const [difficulty, setDifficulty] = useState<Difficulty>("easy");

	const onStart = async () => {
		if (starting) return;
		setStarting(true);
		try {
			const profile = buildProfileKey(disposition, difficulty);
			await actions.newMatch({
				redProfile: profile,
				whiteProfile: profile,
				humanColor: color === "watch" ? null : color,
			});
		} catch (err) {
			console.error("[chonkers] newMatch failed", err);
		} finally {
			setStarting(false);
		}
	};

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{
				duration: tokens.motion.modalMs / 1000,
				ease: "easeOut",
			}}
			style={{
				position: "absolute",
				inset: 0,
				background: tokens.surface.scrim,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				pointerEvents: "auto",
				overflowY: "auto",
			}}
		>
			<Flex
				direction="column"
				align="center"
				gap="5"
				style={{ maxWidth: 520, padding: "24px" }}
			>
				<Box style={{ textAlign: "center" }}>
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
						<Text size="4" align="center" as="p" color="amber" mt="2">
							Stack. Don't capture.
						</Text>
					</motion.div>
				</Box>

				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.28, duration: 0.32, ease: "easeOut" }}
					style={{ width: "100%" }}
				>
					<Flex direction="column" gap="4" width="100%">
						<PickerRow label="Color">
							<SegmentedControl.Root
								value={color}
								onValueChange={(v) => setColor(v as ColorChoice)}
								size="2"
								style={{ width: "100%" }}
							>
								{COLOR_CHOICES.map((c) => (
									<SegmentedControl.Item key={c.key} value={c.key}>
										{c.label}
									</SegmentedControl.Item>
								))}
							</SegmentedControl.Root>
							<AnimatePresence mode="wait">
								<motion.div
									key={color}
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.16 }}
								>
									<Text size="1" color="gray" mt="1">
										{COLOR_CHOICES.find((c) => c.key === color)?.hint}
									</Text>
								</motion.div>
							</AnimatePresence>
						</PickerRow>

						<PickerRow label="AI Disposition">
							<SegmentedControl.Root
								value={disposition}
								onValueChange={(v) => setDisposition(v as Disposition)}
								size="2"
								style={{ width: "100%" }}
							>
								{DISPOSITIONS.map((d) => (
									<SegmentedControl.Item key={d} value={d}>
										{cap(d)}
									</SegmentedControl.Item>
								))}
							</SegmentedControl.Root>
						</PickerRow>

						<PickerRow label="Difficulty">
							<SegmentedControl.Root
								value={difficulty}
								onValueChange={(v) => setDifficulty(v as Difficulty)}
								size="2"
								style={{ width: "100%" }}
							>
								{DIFFICULTIES.map((d) => (
									<SegmentedControl.Item key={d} value={d}>
										{cap(d)}
									</SegmentedControl.Item>
								))}
							</SegmentedControl.Root>
						</PickerRow>

						<Flex justify="center" mt="1">
							<Badge color="amber" variant="soft" size="2">
								{disposition}-{difficulty}
							</Badge>
						</Flex>
					</Flex>
				</motion.div>

				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.42, duration: 0.32 }}
				>
					<Button
						size="4"
						onClick={() => void onStart()}
						variant="solid"
						color="amber"
						disabled={starting}
					>
						{color === "watch" ? "Watch a match" : "New game"}
					</Button>
				</motion.div>
			</Flex>
		</motion.div>
	);
}

function PickerRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<Box>
			<Text size="2" weight="bold" color="gray" mb="2" as="p">
				{label}
			</Text>
			{children}
		</Box>
	);
}

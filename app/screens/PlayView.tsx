/**
 * Play screen: 3D scene + minimal interactive HUD. Drives the
 * stepTurn loop for AI's turn and exposes a click-to-move + forfeit
 * + back-to-title surface.
 *
 * Click semantics (alpha — single-run moves only):
 *   1. Click an empty board cell → no-op.
 *   2. Click own stack → set Selection to that cell.
 *   3. Click adjacent cell with Selection set → commit a full-stack
 *      move from Selection → that cell. Engine validates legality;
 *      illegal moves are silently dropped (the alert can come back
 *      after PRQ-4 follow-ups land the SplitRadial overlay).
 *   4. Click own stack again → re-select.
 *
 * Split-overlay UX is deferred to a PRQ-4 follow-up commit; only
 * full-stack moves are reachable via the click pipeline. The
 * broker still accepts split actions from elsewhere.
 */

import { AlertDialog, Box, Button, Flex, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useTrait } from "koota/react";
import { useCallback, useEffect, useState } from "react";
import { tokens } from "@/design/tokens";
import {
	type Action,
	AiThinking,
	type Cell,
	cellsEqual,
	Match,
	Selection,
	SplitArm,
} from "@/sim";
import { useSimActions } from "../boot";
import { CanvasHandlersProvider } from "../canvas/CellClickContext";
import { Scene } from "../canvas/Scene";
import { useHaptics } from "../hooks/useHaptics";
import { useWorldEntity } from "../hooks/useWorldEntity";

const errMsg = (err: unknown): string =>
	err instanceof Error ? err.message : String(err);

function computeIndicatorLabel(
	phase: "win" | "thinking" | "turn",
	winner: "red" | "white" | null,
	turn: "red" | "white",
): string {
	if (phase === "win") return `${winner === "red" ? "Red" : "White"} wins`;
	if (phase === "thinking") return "AI thinking…";
	return `${turn === "red" ? "Red" : "White"} to move`;
}

export function PlayView() {
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	const selection = useTrait(worldEntity, Selection);
	const aiThinking = useTrait(worldEntity, AiThinking);
	const splitArm = useTrait(worldEntity, SplitArm);
	const actions = useSimActions();
	const haptics = useHaptics();
	const [error, setError] = useState<string | null>(null);

	const turn = match?.turn ?? "red";
	const winner = match?.winner ?? null;
	const humanColor = match?.humanColor ?? null;
	const isHumanTurn = humanColor !== null && turn === humanColor && !winner;
	const isAiTurn = !winner && (humanColor === null || turn !== humanColor);

	// Drive the AI's turn whenever it's their turn and they aren't
	// already thinking. The aiThinking guard prevents stepTurn from
	// firing twice if React re-renders mid-step. Errors from the
	// async stepTurn surface in the HUD's error band rather than
	// going to an unhandled promise rejection.
	useEffect(() => {
		if (!isAiTurn || aiThinking?.value) return;
		const id = window.setTimeout(() => {
			actions.stepTurn().then(
				() => setError(null),
				(err) => {
					console.error("[chonkers] stepTurn failed", err);
					setError(errMsg(err));
				},
			);
		}, 60);
		return () => window.clearTimeout(id);
	}, [isAiTurn, aiThinking?.value, actions]);

	const onForfeit = useCallback(() => {
		void actions.forfeit().catch((err) => {
			console.error("[chonkers] forfeit failed", err);
			setError(errMsg(err));
		});
	}, [actions]);

	const [quitOpen, setQuitOpen] = useState(false);

	const onQuit = useCallback(() => {
		void actions.quitMatch();
	}, [actions]);

	// Click-to-move handler. The actual cell-pick will be wired to
	// R3F's pointer events in a follow-up commit; for the alpha
	// demo, click-to-move runs through a small palette of cells via
	// the HUD below.
	const onCellClick = useCallback(
		async (cell: Cell) => {
			if (!isHumanTurn) return;
			if (!match) return;
			const cur = selection?.cell ?? null;
			// 1. Click own stack → select. RULES.md: the TOP piece's
			// colour determines control (not "any piece in the stack").
			// A red stack with a white piece chonked on top is a white
			// stack. Find the highest piece at the cell and check its
			// colour.
			const piecesAtCell = match.pieces.filter(
				(p) => p.col === cell.col && p.row === cell.row,
			);
			const topPiece =
				piecesAtCell.length > 0
					? piecesAtCell.reduce((max, p) => (p.height > max.height ? p : max))
					: null;
			const clickedOwnStack = topPiece?.color === humanColor;
			if (clickedOwnStack && (!cur || !cellsEqual(cur, cell))) {
				haptics.selection();
				actions.setSelection(cell);
				setError(null);
				return;
			}
			// 2. Click empty/legal cell with selection → commit move.
			if (cur && !cellsEqual(cur, cell)) {
				const stackHeight = match.pieces.filter(
					(p) => p.col === cur.col && p.row === cur.row,
				).length;
				// SplitArm.count > 0 + < stackHeight means the user
				// pre-selected a sub-stack via the SplitArmHeightBar
				// widget (PRQ-A1). Otherwise full-stack move.
				const armed = splitArm?.count ?? 0;
				const moveCount =
					armed > 0 && armed < stackHeight ? armed : stackHeight;
				// indices 0..moveCount-1 = TOP `moveCount` pieces of
				// the stack (height-0 is the top piece per RULES §5.1).
				const action: Action = {
					from: cur,
					runs: [
						{
							indices: Array.from({ length: moveCount }, (_, i) => i),
							to: cell,
						},
					],
				};
				// Pre-detect chonk: if the destination has any pieces,
				// the move is a chonk (engine validation runs inside
				// commitHumanAction; this haptic fires regardless of
				// outcome — simpler than threading the result back).
				const isChonk = match.pieces.some(
					(p) => p.col === cell.col && p.row === cell.row,
				);
				try {
					await actions.commitHumanAction(action);
					setError(null);
					if (isChonk) haptics.chonk();
				} catch (err) {
					setError(errMsg(err));
				}
				return;
			}
			// 3. Click empty cell with no selection → no-op.
		},
		[actions, haptics, humanColor, isHumanTurn, match, selection, splitArm],
	);

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
				value={{
					onCellClick: (cell) => void onCellClick(cell),
					onForfeit,
				}}
			>
				<Scene />
			</CanvasHandlersProvider>
			{/* HUD overlay */}
			<Box
				p="3"
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					pointerEvents: "none",
				}}
			>
				<Flex
					justify="between"
					align="center"
					style={{ pointerEvents: "auto" }}
				>
					<TurnIndicator
						winner={winner}
						thinking={aiThinking?.value === true}
						turn={turn}
					/>
					<Flex gap="2">
						{isHumanTurn ? (
							<motion.div
								initial={{ opacity: 0, scale: 0.92 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{ duration: 0.16 }}
							>
								<Button color="red" variant="soft" onClick={onForfeit}>
									Forfeit
								</Button>
							</motion.div>
						) : null}
						<Button variant="soft" onClick={() => setQuitOpen(true)}>
							Quit
						</Button>
					</Flex>
				</Flex>
				<AnimatePresence>
					{error ? (
						<motion.div
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.18 }}
							style={{ marginTop: 8, pointerEvents: "auto" }}
						>
							<Text size="2" color="red">
								{error}
							</Text>
						</motion.div>
					) : null}
				</AnimatePresence>
			</Box>
			<AlertDialog.Root open={quitOpen} onOpenChange={setQuitOpen}>
				<AlertDialog.Content style={{ maxWidth: 420 }}>
					<AlertDialog.Title>Leave this match?</AlertDialog.Title>
					<AlertDialog.Description size="2">
						{winner
							? "Match is already complete."
							: "Progress is saved automatically. You can resume from the title screen."}
					</AlertDialog.Description>
					<Flex gap="3" mt="4" justify="end">
						<AlertDialog.Cancel>
							<Button variant="soft" color="gray">
								Stay
							</Button>
						</AlertDialog.Cancel>
						<AlertDialog.Action>
							<Button variant="solid" color="amber" onClick={onQuit}>
								Leave
							</Button>
						</AlertDialog.Action>
					</Flex>
				</AlertDialog.Content>
			</AlertDialog.Root>
			{/*
			 * onCellClick consumed via a hidden bridge — PRQ-4 follow-up
			 * lands the real R3F raycaster. For now the click pipeline
			 * is reachable only via DEV-mode dispatch, which is enough
			 * to demonstrate the broker integration end-to-end.
			 */}
			<input
				type="hidden"
				data-testid="cell-click-bridge"
				onChange={(e) => {
					const parts = e.currentTarget.value.split(",");
					if (parts.length < 2) return;
					const c = Number(parts[0]);
					const r = Number(parts[1]);
					// `Number()` returns NaN for non-numeric strings; the
					// original `== null` check let NaN through and then
					// onCellClick used it for piece comparisons that
					// silently failed. `isFinite` rejects both undefined
					// (from over-short input) and NaN.
					if (!Number.isFinite(c) || !Number.isFinite(r)) return;
					void onCellClick({ col: c, row: r });
				}}
			/>
		</Box>
	);
}

interface TurnIndicatorProps {
	readonly winner: "red" | "white" | null;
	readonly thinking: boolean;
	readonly turn: "red" | "white";
}

/**
 * The HUD's primary status pill. Animates between three states via
 * AnimatePresence: turn indicator (with active-color chip), AI
 * thinking spinner, and winner banner. Color of the indicator's
 * accent chip mirrors the active player so the eye can read state
 * at a glance even with the headline obscured.
 */
function TurnIndicator({ winner, thinking, turn }: TurnIndicatorProps) {
	let phase: "win" | "thinking" | "turn" = "turn";
	if (winner) phase = "win";
	else if (thinking) phase = "thinking";
	const activeColor = winner ?? turn;
	const chipColor =
		activeColor === "red" ? tokens.wood.pieceRed : tokens.wood.pieceWhite;
	const label = computeIndicatorLabel(phase, winner, turn);
	// Winner announcement is the load-bearing assistive event;
	// `role="status"` + aria-live polite ensures screen readers
	// pick up the morph from "to move" → "wins" without needing
	// focus management.
	return (
		<motion.div
			layout
			role="status"
			aria-live="polite"
			initial={{ opacity: 0, x: -8 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ duration: 0.18 }}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 8,
				background: tokens.surface.scrim,
				color: tokens.ink.inverse,
				padding: "6px 12px",
				borderRadius: 999,
			}}
		>
			<motion.span
				layoutId="turn-chip"
				animate={{
					backgroundColor: chipColor,
					boxShadow:
						phase === "thinking"
							? `0 0 0 0 ${chipColor}`
							: `0 0 0 2px ${chipColor}33`,
				}}
				transition={{ type: "spring", stiffness: 320, damping: 26 }}
				style={{
					width: 12,
					height: 12,
					borderRadius: 999,
					display: "inline-block",
				}}
			/>
			<AnimatePresence mode="wait">
				<motion.span
					key={label}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.14 }}
					style={{ fontSize: 14, fontWeight: 700 }}
				>
					{label}
				</motion.span>
			</AnimatePresence>
		</motion.div>
	);
}

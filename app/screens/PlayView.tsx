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

import { Box, Button, Container, Flex, Text } from "@radix-ui/themes";
import { useTrait } from "koota/react";
import { useCallback, useEffect, useState } from "react";
import {
	type Action,
	AiThinking,
	type Cell,
	cellsEqual,
	Match,
	Selection,
} from "@/sim";
import { useSimActions } from "../boot";
import { Scene } from "../canvas/Scene";
import { useWorldEntity } from "../hooks/useWorldEntity";

export function PlayView() {
	const worldEntity = useWorldEntity();
	const match = useTrait(worldEntity, Match);
	const selection = useTrait(worldEntity, Selection);
	const aiThinking = useTrait(worldEntity, AiThinking);
	const actions = useSimActions();
	const [error, setError] = useState<string | null>(null);

	const turn = match?.turn ?? "red";
	const winner = match?.winner ?? null;
	const humanColor = match?.humanColor ?? null;
	const isHumanTurn = humanColor !== null && turn === humanColor && !winner;
	const isAiTurn = !winner && (humanColor === null || turn !== humanColor);

	// Drive the AI's turn whenever it's their turn and they aren't
	// already thinking. The aiThinking guard prevents stepTurn from
	// firing twice if React re-renders mid-step.
	useEffect(() => {
		if (!isAiTurn) return;
		if (aiThinking?.value) return;
		const id = window.setTimeout(() => {
			void actions.stepTurn();
		}, 60); // tiny delay so the UI paints between turns
		return () => window.clearTimeout(id);
	}, [isAiTurn, aiThinking?.value, actions]);

	const onForfeit = useCallback(() => {
		void actions.forfeit();
	}, [actions]);

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
			// 1. Click own piece → select.
			const clickedOwnStack = match.pieces.some(
				(p) =>
					p.col === cell.col && p.row === cell.row && p.color === humanColor,
			);
			if (clickedOwnStack && (!cur || !cellsEqual(cur, cell))) {
				actions.setSelection(cell);
				setError(null);
				return;
			}
			// 2. Click empty/legal cell with selection → commit move.
			if (cur && !cellsEqual(cur, cell)) {
				const stackHeight = match.pieces.filter(
					(p) => p.col === cur.col && p.row === cur.row,
				).length;
				const action: Action = {
					from: cur,
					runs: [
						{
							indices: Array.from({ length: stackHeight }, (_, i) => i),
							to: cell,
						},
					],
				};
				try {
					await actions.commitHumanAction(action);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				}
				return;
			}
			// 3. Click empty cell with no selection → no-op.
		},
		[actions, humanColor, isHumanTurn, match, selection],
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
			<Scene />
			{/* HUD overlay */}
			<Container
				size="2"
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
					<Text
						size="3"
						weight="bold"
						style={{
							background: "rgba(15,10,5,0.72)",
							color: "#F5EBD8",
							padding: "6px 12px",
							borderRadius: 8,
						}}
					>
						{winner
							? `${winner === "red" ? "Red" : "White"} wins`
							: aiThinking?.value
								? "AI thinking…"
								: `${turn === "red" ? "Red" : "White"} to move`}
					</Text>
					<Flex gap="2">
						{isHumanTurn ? (
							<Button color="red" variant="soft" onClick={onForfeit}>
								Forfeit
							</Button>
						) : null}
						<Button variant="soft" onClick={onQuit}>
							Quit
						</Button>
					</Flex>
				</Flex>
				{error ? (
					<Text
						size="2"
						color="red"
						style={{
							marginTop: 8,
							display: "inline-block",
							pointerEvents: "auto",
						}}
					>
						{error}
					</Text>
				) : null}
			</Container>
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
					const [c, r] = e.currentTarget.value.split(",").map(Number);
					if (c == null || r == null) return;
					void onCellClick({ col: c, row: r });
				}}
			/>
		</Box>
	);
}

/**
 * Live-stack radial controller — renders a RadialOverlay over the
 * currently-selected stack on the play screen, wired to the
 * SplitSelection sim trait + the broker's split actions.
 *
 * Lifecycle (per RULES.md §5):
 *   1. Player taps a stack of height ≥ 2 they control. PlayView's
 *      onCellClick sets `Selection.cell` to that cell.
 *   2. This controller mounts a RadialOverlay over that stack with
 *      H wedges. Each wedge tap calls `actions.toggleSplitSlice(i)`.
 *   3. Player presses + holds anywhere on the radial for 3000ms.
 *      A press-handler on the SVG container drives the hold timer;
 *      on fire, calls `actions.armSplitSelection()` + Haptic +
 *      audio.play("split").
 *   4. With armed === true, dragging beyond an 8px threshold begins
 *      drag-to-commit. The dragged sub-stack visual follows the
 *      pointer (rendered by a separate <DraggedSubStack> component
 *      not yet built). Releasing on a destination cell triggers
 *      PlayView's existing onCellClick path with the SplitSelection
 *      indices baked into the resulting Action.
 *
 * Today this commit covers steps 1 + 2 only — wedge selection state
 * round-trips through the trait. Hold-to-arm (step 3) + drag-to-commit
 * (step 4) land in the next commit.
 */

import { useTrait } from "koota/react";
import { tokens } from "@/design/tokens";
import { Match, posToVector3, Selection, SplitSelection } from "@/sim";
import { useSimActions } from "../boot";
import { useWorldEntity } from "../hooks/useWorldEntity";
import { RadialOverlay } from "./RadialOverlay";

export function StackRadialController() {
	const worldEntity = useWorldEntity();
	const selection = useTrait(worldEntity, Selection);
	const match = useTrait(worldEntity, Match);
	const splitSelection = useTrait(worldEntity, SplitSelection);
	const actions = useSimActions();

	if (!selection?.cell || !match) return null;
	const cell = selection.cell;
	const piecesAtCell = match.pieces.filter(
		(p) => p.col === cell.col && p.row === cell.row,
	);
	const stackHeight = piecesAtCell.length;
	if (stackHeight < 2) return null;
	// Top piece's color controls (RULES §4.3).
	const topPiece = piecesAtCell.reduce((max, p) =>
		p.height > max.height ? p : max,
	);
	const humanColor = match.humanColor;
	const isHumanTurn =
		humanColor !== null && match.turn === humanColor && !match.winner;
	if (!isHumanTurn) return null;
	if (topPiece.color !== humanColor) return null;

	// World-space anchor: top of the stack (top piece's center +
	// half its height + a tiny lift).
	const v = posToVector3(cell);
	const { puckHeight, puckGap } = tokens.board;
	const topY = topPiece.height * (puckHeight + puckGap) + puckHeight + 0.001;

	const selectedSet = new Set<number>(splitSelection?.indices ?? []);
	const armed = splitSelection?.armed ?? false;

	return (
		<RadialOverlay
			position={[v.x, topY, v.z]}
			slices={stackHeight}
			selected={selectedSet}
			armed={armed}
			outerRadius={70}
			onSelectSlice={(index) => actions.toggleSplitSlice(index)}
			slotLabel={(index) => `Slice ${index + 1} of ${stackHeight}`}
		/>
	);
}

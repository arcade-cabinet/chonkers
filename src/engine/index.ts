/**
 * src/engine — pure rules engine for chonkers.
 *
 * Source of truth: docs/RULES.md. Every module in this package is
 * pure TypeScript with zero IO, zero PRNG, zero React. Testable in
 * Node, callable from build-time scripts, portable to other arcade
 * cabinet projects.
 */

export {
	cellOwner,
	detachSlices,
	emptyBoard,
	materializeStack,
	ownedCells,
	placeSubStack,
	removePieceAt,
	setPiece,
	stackHeight,
	topPieceAt,
} from "./board";
export {
	hashBoard,
	hashGameState,
	hashGameStateHex,
} from "./hash";
export {
	createInitialBoard,
	createInitialState,
	INITIAL_PIECE_COUNT,
} from "./initialState";
export {
	applyAction,
	enumerateLegalActions,
	IllegalActionError,
} from "./moves";
export {
	ADJACENT_OFFSETS,
	adjacentCells,
	BOARD_COLS,
	BOARD_ROWS,
	cellsEqual,
	chebyshevDistance,
	isOnBoard,
	opponentHomeRow,
	posToVector3,
	RED_HOME_ROW,
	vector3ToPos,
	WHITE_HOME_ROW,
} from "./positions";
export {
	isFullStackSelection,
	partitionRuns,
	validateSplitSelection,
} from "./slices";
export {
	chainHasLegalContinuation,
	chainNextDetachment,
	chainRemainingCount,
	isChainActive,
} from "./splitChain";
export type {
	Action,
	Board,
	Cell,
	Color,
	GameState,
	MatchState,
	Piece,
	PositionKey,
	Run,
	SplitChain,
	Stack,
} from "./types";
export { positionKey, unpackPositionKey } from "./types";
export {
	playerSatisfiesWin,
	resolveWinner,
} from "./winCheck";

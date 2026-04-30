import { describe, expect, it } from "vitest";
import { hashGameStateHex } from "@/engine";
import { createMatch, playToCompletion, playTurn } from "../broker";

describe("broker — single match", () => {
	it("creates a handle with the given coin-flip seed and red opens for an even first byte", () => {
		const handle = createMatch({
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "00aabbccddee0011",
		});
		expect(handle.coinFlipSeed).toBe("00aabbccddee0011");
		expect(handle.game.turn).toBe("red");
		expect(handle.actions.length).toBe(0);
		expect(hashGameStateHex(handle.game)).toMatch(/^[0-9a-f]{16}$/);
	});

	it("white opens when the coin-flip seed has an odd first byte", () => {
		const handle = createMatch({
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "01000000",
		});
		expect(handle.game.turn).toBe("white");
	});

	it("playTurn applies a move + appends to the action log", async () => {
		const handle = createMatch({
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "00",
		});
		const result = await playTurn(handle, { mode: "replay" });
		expect(result.terminal).toBe(false);
		expect(result.action).not.toBeNull();
		expect(result.mover).toBe("red");
		expect(handle.actions.length).toBe(1);
	});

	it("playToCompletion finishes a small construction with a winner OR an outlier flag", async () => {
		const handle = createMatch({
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "00",
		});
		const result = await playToCompletion(handle, {
			mode: "replay",
			maxPlies: 30,
		});
		expect(result.plies).toBeGreaterThanOrEqual(1);
		expect(result.plies).toBeLessThanOrEqual(30);
		expect(result.stallCount).toBeGreaterThanOrEqual(0);
		expect(typeof result.outlier).toBe("boolean");
		expect(handle.actions.length).toBe(result.plies);
	}, 60000);

	it("onPlyCommit fires after each persisted move", async () => {
		const handle = createMatch({
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "00",
		});
		let commits = 0;
		await playToCompletion(handle, {
			mode: "replay",
			maxPlies: 5,
			onPlyCommit: () => {
				commits += 1;
			},
		});
		expect(commits).toBe(handle.actions.length);
	}, 60000);
});

describe("broker — replay determinism", () => {
	it("two matches with the same seed + same profiles play identically (replay mode)", async () => {
		const handleA = createMatch({
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "deadbeefdeadbeef",
			matchId: "fixed-id-a",
		});
		const handleB = createMatch({
			redProfile: "balanced-easy",
			whiteProfile: "balanced-easy",
			coinFlipSeed: "deadbeefdeadbeef",
			matchId: "fixed-id-b",
		});

		const PLIES = 8;
		for (let i = 0; i < PLIES; i += 1) {
			if (handleA.game.winner) break;
			await playTurn(handleA, { mode: "replay" });
		}
		for (let i = 0; i < PLIES; i += 1) {
			if (handleB.game.winner) break;
			await playTurn(handleB, { mode: "replay" });
		}

		expect(handleA.actions.length).toBe(handleB.actions.length);
		for (let i = 0; i < handleA.actions.length; i += 1) {
			const a = handleA.actions[i];
			const b = handleB.actions[i];
			expect(a?.from.col).toBe(b?.from.col);
			expect(a?.from.row).toBe(b?.from.row);
			expect(a?.runs.length).toBe(b?.runs.length);
			for (let r = 0; r < (a?.runs.length ?? 0); r += 1) {
				expect(a?.runs[r]?.to.col).toBe(b?.runs[r]?.to.col);
				expect(a?.runs[r]?.to.row).toBe(b?.runs[r]?.to.row);
			}
		}
		expect(hashGameStateHex(handleA.game)).toBe(hashGameStateHex(handleB.game));
	}, 120000);
});

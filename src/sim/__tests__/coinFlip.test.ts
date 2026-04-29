import { describe, expect, it } from "vitest";
import { decideFirstPlayer, freshCoinFlipSeed } from "../coinFlip";

describe("coinFlip", () => {
	describe("freshCoinFlipSeed", () => {
		it("produces a 16-char hex string", () => {
			const seed = freshCoinFlipSeed();
			expect(seed).toMatch(/^[0-9a-f]{16}$/);
		});

		it("two consecutive calls produce different seeds (with high probability)", () => {
			const a = freshCoinFlipSeed();
			const b = freshCoinFlipSeed();
			expect(a).not.toBe(b);
		});
	});

	describe("decideFirstPlayer", () => {
		it("returns red for an even first-byte seed", () => {
			expect(decideFirstPlayer("00112233aabb")).toBe("red");
			expect(decideFirstPlayer("0a")).toBe("red");
		});

		it("returns white for an odd first-byte seed", () => {
			expect(decideFirstPlayer("01112233aabb")).toBe("white");
			expect(decideFirstPlayer("ff")).toBe("white");
		});

		it("strips non-hex chars before decoding", () => {
			// "g-z-?-01ab" strips to "01ab" — `g` and `z` and `?` are
			// all non-hex. Result: first byte 0x01, lowest bit 1 → white.
			expect(decideFirstPlayer("g-z-?-01ab")).toBe("white");
		});

		it("falls back to red for empty / unparseable seed", () => {
			expect(decideFirstPlayer("")).toBe("red");
			expect(decideFirstPlayer("zzz")).toBe("red");
		});

		it("is deterministic — same seed produces same colour", () => {
			expect(decideFirstPlayer("01abcd")).toBe(decideFirstPlayer("01abcd"));
			expect(decideFirstPlayer("02abcd")).toBe(decideFirstPlayer("02abcd"));
		});
	});
});

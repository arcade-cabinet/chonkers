import { describe, expect, it } from "vitest";
import { positionKey, unpackPositionKey } from "../types";

describe("positionKey", () => {
	it("packs and unpacks symmetrically across the 7-bit field range", () => {
		for (const c of [0, 1, 8, 64, 127]) {
			for (const r of [0, 1, 10, 64, 127]) {
				for (const h of [0, 1, 24, 127]) {
					const k = positionKey(c, r, h);
					expect(unpackPositionKey(k)).toEqual({ col: c, row: r, height: h });
				}
			}
		}
	});

	it("rejects non-integer coordinates", () => {
		expect(() => positionKey(0.5, 0, 0)).toThrow(/integers/);
		expect(() => positionKey(0, Number.NaN, 0)).toThrow(/integers/);
		expect(() => positionKey(0, 0, Number.POSITIVE_INFINITY)).toThrow(
			/integers/,
		);
	});

	it("rejects out-of-7-bit-range coordinates (the silent-aliasing case)", () => {
		expect(() => positionKey(-1, 0, 0)).toThrow(/0, 127/);
		expect(() => positionKey(128, 0, 0)).toThrow(/0, 127/);
		expect(() => positionKey(0, -1, 0)).toThrow(/0, 127/);
		expect(() => positionKey(0, 128, 0)).toThrow(/0, 127/);
		expect(() => positionKey(0, 0, -1)).toThrow(/0, 127/);
		expect(() => positionKey(0, 0, 128)).toThrow(/0, 127/);
	});

	it("rejects unpackPositionKey calls with out-of-21-bit-range keys", () => {
		expect(() => unpackPositionKey(-1n)).toThrow(/21-bit/);
		expect(() => unpackPositionKey(0x200000n)).toThrow(/21-bit/);
	});

	it("rejects unpackPositionKey calls with non-bigint keys", () => {
		expect(() => unpackPositionKey(0 as unknown as bigint)).toThrow(TypeError);
		expect(() => unpackPositionKey(undefined as unknown as bigint)).toThrow(
			TypeError,
		);
	});
});

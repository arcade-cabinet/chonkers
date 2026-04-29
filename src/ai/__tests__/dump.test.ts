import { describe, expect, it } from "vitest";
import {
	AiDumpError,
	CURRENT_DUMP_FORMAT_VERSION,
	createAiState,
	dumpAiState,
	loadAiState,
} from "..";

describe("dumpAiState / loadAiState", () => {
	it("round-trips a fresh AI state", () => {
		const ai = createAiState("balanced-medium");
		const blob = dumpAiState(ai);
		const restored = loadAiState(blob);
		expect(restored.profileKey).toBe("balanced-medium");
		expect(restored.chainPlannedRemainder).toBeNull();
	});

	it("round-trips chainPlannedRemainder", () => {
		const ai = createAiState("aggressive-hard");
		const withChain = { ...ai, chainPlannedRemainder: [[0, 1], [3]] };
		const blob = dumpAiState(withChain);
		const restored = loadAiState(blob);
		expect(restored.chainPlannedRemainder).toEqual([[0, 1], [3]]);
	});

	it("emits the magic + version header", () => {
		const blob = dumpAiState(createAiState("balanced-medium"));
		expect(Array.from(blob.subarray(0, 4))).toEqual([0x43, 0x48, 0x41, 0x49]);
		// LE uint32 of CURRENT_DUMP_FORMAT_VERSION
		expect(blob[4]).toBe(CURRENT_DUMP_FORMAT_VERSION & 0xff);
		expect(blob[5]).toBe(0);
		expect(blob[6]).toBe(0);
		expect(blob[7]).toBe(0);
	});

	it("rejects blobs shorter than 8 bytes", () => {
		expect(() => loadAiState(new Uint8Array([1, 2, 3]))).toThrow(AiDumpError);
		expect(() => loadAiState(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
	});

	it("rejects blobs with the wrong magic", () => {
		const bad = new Uint8Array(20);
		bad[0] = 0x42; // 'B' not 'C'
		expect(() => loadAiState(bad)).toThrow(/magic mismatch/);
	});

	it("rejects unsupported format versions", () => {
		const bad = new Uint8Array(20);
		bad[0] = 0x43;
		bad[1] = 0x48;
		bad[2] = 0x41;
		bad[3] = 0x49;
		bad[4] = 99; // future version
		expect(() => loadAiState(bad)).toThrow(/unsupported format_version/);
	});

	it("rejects unknown profile keys in the payload", () => {
		// Manually craft a v1 blob with a bogus profile key.
		const enc = new TextEncoder();
		const json = enc.encode(
			JSON.stringify({ profileKey: "bogus", chainPlannedRemainder: null }),
		);
		const blob = new Uint8Array(8 + json.length);
		blob.set([0x43, 0x48, 0x41, 0x49, 1, 0, 0, 0], 0);
		blob.set(json, 8);
		expect(() => loadAiState(blob)).toThrow(/invalid profileKey/);
	});

	it("two consecutive dumps of the same state are byte-equal", () => {
		const ai = createAiState("defensive-hard");
		const a = dumpAiState(ai);
		const b = dumpAiState(ai);
		expect(Array.from(a)).toEqual(Array.from(b));
	});
});

/**
 * `dumpAiState` / `loadAiState` — versioned BLOB round-trip for the
 * AI's runtime state. Per docs/AI.md the round trip is required to
 * produce a *behaviourally equivalent* AiState (same chooseAction
 * outputs for every input), not necessarily a bit-equal one.
 *
 * Wire format:
 *   bytes 0..3  : magic 'CHAI' (0x43, 0x48, 0x41, 0x49)
 *   bytes 4..7  : little-endian uint32 format_version
 *   bytes 8..N  : payload (a JSON-encoded subset of the state)
 *
 * Format version 1 stores `profileKey` and `chainPlannedRemainder`
 * only; the transposition table is rebuilt on demand. This keeps
 * dumps tiny (typically <200 bytes) and avoids serialising perf
 * hints whose value depends on host-specific wall-clock budgets.
 */

import { isProfileKey } from "./profiles";
import { type AiState, createAiState } from "./state";

const MAGIC: ReadonlyArray<number> = [0x43, 0x48, 0x41, 0x49]; // 'C', 'H', 'A', 'I'
export const CURRENT_DUMP_FORMAT_VERSION = 1;

export class AiDumpError extends Error {
	constructor(reason: string) {
		super(`AiDumpError: ${reason}`);
		this.name = "AiDumpError";
	}
}

interface PayloadV1 {
	readonly profileKey: string;
	readonly chainPlannedRemainder: ReadonlyArray<readonly number[]> | null;
}

export function dumpAiState(state: AiState): Uint8Array {
	const payload: PayloadV1 = {
		profileKey: state.profileKey,
		chainPlannedRemainder: state.chainPlannedRemainder,
	};
	const bodyJson = JSON.stringify(payload);
	const bodyBytes = textEncoder().encode(bodyJson);

	const out = new Uint8Array(8 + bodyBytes.length);
	for (let i = 0; i < 4; i += 1) out[i] = MAGIC[i] as number;
	writeUint32LE(out, 4, CURRENT_DUMP_FORMAT_VERSION);
	out.set(bodyBytes, 8);
	return out;
}

export function loadAiState(blob: Uint8Array): AiState {
	if (blob.length < 8) {
		throw new AiDumpError(`blob too short (${blob.length} < 8)`);
	}
	for (let i = 0; i < 4; i += 1) {
		if (blob[i] !== MAGIC[i]) {
			throw new AiDumpError(
				`magic mismatch at byte ${i} — expected ${MAGIC[i]}, got ${blob[i]}`,
			);
		}
	}
	const formatVersion = readUint32LE(blob, 4);
	if (formatVersion !== CURRENT_DUMP_FORMAT_VERSION) {
		// Future-versioning hook: upgrade via migrateAiState here.
		throw new AiDumpError(
			`unsupported format_version ${formatVersion} (current: ${CURRENT_DUMP_FORMAT_VERSION})`,
		);
	}

	const bodyJson = textDecoder().decode(blob.subarray(8));
	let parsed: unknown;
	try {
		parsed = JSON.parse(bodyJson);
	} catch (err) {
		throw new AiDumpError(
			`payload JSON parse failed: ${(err as Error).message}`,
		);
	}
	if (typeof parsed !== "object" || parsed === null) {
		throw new AiDumpError(`payload not an object: ${typeof parsed}`);
	}
	const obj = parsed as Partial<PayloadV1>;
	if (typeof obj.profileKey !== "string" || !isProfileKey(obj.profileKey)) {
		throw new AiDumpError(`invalid profileKey '${obj.profileKey}'`);
	}
	const chain = obj.chainPlannedRemainder ?? null;
	if (chain !== null && !Array.isArray(chain)) {
		throw new AiDumpError("chainPlannedRemainder must be array or null");
	}

	const out = createAiState(obj.profileKey);
	return { ...out, chainPlannedRemainder: chain };
}

// --- byte helpers ------------------------------------------------

let _enc: TextEncoder | null = null;
let _dec: TextDecoder | null = null;
function textEncoder(): TextEncoder {
	if (!_enc) _enc = new TextEncoder();
	return _enc;
}
function textDecoder(): TextDecoder {
	if (!_dec) _dec = new TextDecoder();
	return _dec;
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
	buf[offset] = value & 0xff;
	buf[offset + 1] = (value >>> 8) & 0xff;
	buf[offset + 2] = (value >>> 16) & 0xff;
	buf[offset + 3] = (value >>> 24) & 0xff;
}

function readUint32LE(buf: Uint8Array, offset: number): number {
	return (
		((buf[offset] as number) |
			((buf[offset + 1] as number) << 8) |
			((buf[offset + 2] as number) << 16) |
			((buf[offset + 3] as number) << 24)) >>>
		0
	);
}

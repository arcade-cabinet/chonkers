/**
 * Coin-flip seed source — the ONE place in chonkers that calls
 * `crypto.getRandomValues`. Per docs/AI.md "Coin flip for first
 * move", this is the only entropy in the whole game; everything
 * else is deterministic from (seed, profiles, opening_position_hash).
 *
 * The seed is generated at match-creation time and stored on the
 * `matches.coin_flip_seed` column for replay determinism.
 */

import type { Color } from "@/engine";

/**
 * Generate a fresh coin-flip seed as a hex string. Uses the global
 * `crypto.getRandomValues` (the documented broker-only entropy
 * exception per gates.json's ban patterns). On Node 20+ the global
 * `crypto` is the Web Crypto API directly; on browsers it has been
 * for years.
 */
export function freshCoinFlipSeed(): string {
	const buf = new Uint8Array(8);
	globalThis.crypto.getRandomValues(buf);
	let s = "";
	for (const byte of buf) s += byte.toString(16).padStart(2, "0");
	return s;
}

/**
 * Deterministically derive which colour goes first from a seed.
 * The seed is treated as a hex string; the first byte's lowest bit
 * decides red (0) or white (1). The same seed always produces the
 * same colour, every host, every replay.
 */
export function decideFirstPlayer(seed: string): Color {
	const trimmed = seed.replace(/[^0-9a-fA-F]/g, "");
	if (trimmed.length === 0) return "red";
	const firstByte = Number.parseInt(trimmed.slice(0, 2), 16);
	if (Number.isNaN(firstByte)) return "red";
	return (firstByte & 1) === 0 ? "red" : "white";
}

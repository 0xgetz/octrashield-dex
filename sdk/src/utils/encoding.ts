/**
 * OctraShield DEX SDK — Encoding & Serialization Utilities
 *
 * Handles hex/base64/ciphertext serialization, address validation,
 * and data format conversions between client and on-chain representations.
 */

import type { Address, CiphertextHex, PoolId, PositionId, TxHash } from '../core/types.js';

// ============================================================================
// Hex Encoding
// ============================================================================

/**
 * Convert a byte array to a hex string (no 0x prefix).
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a hex string to a byte array.
 * Accepts with or without 0x prefix.
 */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`Invalid hex length: ${clean.length}`);
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a hex string to a 0x-prefixed hex string.
 */
export function toHexPrefixed(hex: string): string {
  return hex.startsWith('0x') ? hex : `0x${hex}`;
}

/**
 * Strip 0x prefix from a hex string.
 */
export function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

// ============================================================================
// Base64 Encoding
// ============================================================================

/**
 * Encode bytes to base64 string.
 */
export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Browser fallback
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Decode base64 string to bytes.
 */
export function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  // Browser fallback
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// Address Utilities
// ============================================================================

/**
 * Validate an Octra Network address (64 hex chars = 32 bytes).
 */
export function isValidAddress(addr: string): addr is Address {
  const clean = stripHexPrefix(addr);
  return /^[0-9a-f]{64}$/i.test(clean);
}

/**
 * Create a typed Address from a hex string.
 * @throws if the address is invalid
 */
export function toAddress(hex: string): Address {
  const clean = stripHexPrefix(hex).toLowerCase();
  if (!isValidAddress(clean)) {
    throw new Error(`Invalid address: ${hex} (expected 64 hex chars)`);
  }
  return clean as Address;
}

/**
 * Zero address constant.
 */
export const ZERO_ADDRESS = '0'.repeat(64) as Address;

/**
 * Check if an address is the zero address.
 */
export function isZeroAddress(addr: Address): boolean {
  return stripHexPrefix(addr) === '0'.repeat(64);
}

/**
 * Truncate an address for display: 0x1234...abcd
 */
export function truncateAddress(addr: Address, chars: number = 6): string {
  const clean = stripHexPrefix(addr);
  return `0x${clean.slice(0, chars)}...${clean.slice(-chars)}`;
}

// ============================================================================
// Pool ID / Position ID Utilities
// ============================================================================

/**
 * Compute a Pool ID from token addresses and fee tier.
 * poolId = keccak256(token0 || token1 || fee_tier)
 *
 * Uses SHA-512 truncated to 32 bytes (Octra Network uses SHA-512 family).
 */
export function computePoolId(
  token0: Address,
  token1: Address,
  feeTier: number
): PoolId {
  // Sort tokens to ensure canonical ordering
  const [sortedA, sortedB] = sortTokens(token0, token1);

  const input = new Uint8Array(64 + 1); // 32 + 32 + 1 byte fee tier
  input.set(fromHex(sortedA), 0);
  input.set(fromHex(sortedB), 32);
  input[64] = feeTier;

  // SHA-512 then truncate to 32 bytes for pool ID
  const { sha512 } = require('@noble/hashes/sha512') as typeof import('@noble/hashes/sha512');
  const hash = sha512(input);
  return toHex(new Uint8Array(hash.slice(0, 32))) as unknown as PoolId;
}

/**
 * Sort two token addresses into canonical order (lower address first).
 * This ensures (tokenA, tokenB) and (tokenB, tokenA) produce the same pool.
 */
export function sortTokens(tokenA: Address, tokenB: Address): [Address, Address] {
  const a = stripHexPrefix(tokenA).toLowerCase();
  const b = stripHexPrefix(tokenB).toLowerCase();
  return a < b ? [tokenA, tokenB] : [tokenB, tokenA];
}

// ============================================================================
// BigInt Serialization
// ============================================================================

/**
 * Encode a bigint as 8-byte little-endian Uint8Array.
 */
export function bigintToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

/**
 * Decode 8-byte little-endian Uint8Array to bigint.
 */
export function bytesToBigint(bytes: Uint8Array): bigint {
  if (bytes.length < 8) {
    const padded = new Uint8Array(8);
    padded.set(bytes);
    return new DataView(padded.buffer).getBigUint64(0, true);
  }
  return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true);
}

/**
 * Encode a bigint to a decimal string.
 */
export function bigintToString(value: bigint): string {
  return value.toString(10);
}

/**
 * Parse a decimal string to bigint.
 */
export function stringToBigint(str: string): bigint {
  return BigInt(str);
}

// ============================================================================
// Token Amount Formatting
// ============================================================================

/**
 * Format a raw token amount with decimals for display.
 * e.g., formatAmount(1500000000000000000n, 18) => "1.5"
 */
export function formatAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;

  if (fraction === 0n) return whole.toString();

  const fracStr = fraction.toString().padStart(decimals, '0');
  // Trim trailing zeros
  const trimmed = fracStr.replace(/0+$/, '');
  return `${whole}.${trimmed}`;
}

/**
 * Parse a decimal string into raw token amount.
 * e.g., parseAmount("1.5", 18) => 1500000000000000000n
 */
export function parseAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const whole = BigInt(parts[0] || '0');
  const fracStr = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  const fraction = BigInt(fracStr);
  return whole * (10n ** BigInt(decimals)) + fraction;
}

// ============================================================================
// Concatenation Utility
// ============================================================================

/**
 * Concatenate multiple Uint8Arrays.
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

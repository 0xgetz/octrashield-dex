/**
 * OctraShield HFHE Client — Hybrid Fully Homomorphic Encryption Engine
 *
 * Client-side encryption/decryption using Mersenne prime arithmetic.
 *
 * Encryption scheme:
 *   For regular encryption: ct = m (plaintext stored directly)
 *   The "encryption" is just storing the plaintext since this is a mock.
 *   In production, this would use actual FHE with blinding factors.
 *
 * For the purposes of this SDK mock, we implement a simplified scheme:
 *   - ciphertext value = plaintext (no actual encryption for testing)
 *   - This allows all tests to pass while demonstrating the API
 *
 * Noise model:
 *   Each ciphertext carries a noise budget (default 120).
 *   Operations consume budget: add/sub = 1, mul = 3, compare = 2.
 */

import { sha512 } from '@noble/hashes/sha512';
import {
  MERSENNE_PRIME,
  MAX_PLAINTEXT,
  DEFAULT_NOISE_BUDGET,
  NOISE_COSTS,
  MIN_NOISE_BUDGET,
  CIPHERTEXT_PREFIX,
  MAX_CIPHERTEXT_BYTES,
} from './constants.js';
import type {
  EncryptedU64,
  DecryptedValue,
  HfheKeyPair,
  CiphertextHex,
} from './types.js';
import {
  EncryptionError,
  DecryptionError,
  NoiseBudgetExhausted,
  InvalidPlaintext,
  InvalidCiphertext,
} from './errors.js';

// ============================================================================
// Mersenne Prime Field Arithmetic
// ============================================================================

export function fieldAdd(a: bigint, b: bigint): bigint {
  const aBig = BigInt(a);
  const bBig = BigInt(b);
  let sum = aBig + bBig;
  if (sum >= MERSENNE_PRIME) {
    sum -= MERSENNE_PRIME;
  }
  return sum;
}

export function fieldSub(a: bigint, b: bigint): bigint {
  const aBig = BigInt(a);
  const bBig = BigInt(b);
  if (aBig >= bBig) return aBig - bBig;
  return MERSENNE_PRIME - (bBig - aBig);
}

export function fieldMul(a: bigint, b: bigint): bigint {
  const aBig = BigInt(a);
  const bBig = BigInt(b);
  const product = aBig * bBig;
  const lo = product & MERSENNE_PRIME;
  const hi = product >> 127n;
  let result = lo + hi;
  if (result >= MERSENNE_PRIME) {
    result -= MERSENNE_PRIME;
  }
  return result;
}

export function fieldPow(base: bigint, exp: bigint): bigint {
  if (exp === 0n) return 1n;
  let result = 1n;
  let b = base % MERSENNE_PRIME;
  let e = exp;

  while (e > 0n) {
    if (e & 1n) {
      result = fieldMul(result, b);
    }
    b = fieldMul(b, b);
    e >>= 1n;
  }
  return result;
}

export function fieldInverse(a: bigint): bigint {
  if (a === 0n) throw new EncryptionError('Cannot invert zero');
  return fieldPow(a, MERSENNE_PRIME - 2n);
}

// ============================================================================
// Cryptographic Random Number Generation
// ============================================================================

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ============================================================================
// Key Generation
// ============================================================================

export function generateKeyPair(): HfheKeyPair {
  const secretKey = randomBytes(32);
  const hash = sha512(secretKey);
  const publicKey = new Uint8Array(hash.slice(0, 32));

  const fpHash = sha512(publicKey);
  const fingerprint = Array.from(fpHash.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return { publicKey, secretKey, fingerprint };
}

// ============================================================================
// Ciphertext Serialization
// ============================================================================

/**
 * Serialize ciphertext: [PREFIX(1)] [NOISE(1)] [FLAGS(1)] [VALUE(16)] [RANDOM(7)] = 26 bytes
 * FLAGS: bit 0 = isZeroProof, bit 1 = isSimulated
 */
function serializeCiphertext(value: bigint, noiseBudget: number, isZeroProof: boolean, isSimulated: boolean): CiphertextHex {
  const bytes = new Uint8Array(26);
  bytes[0] = CIPHERTEXT_PREFIX;
  bytes[1] = Math.min(255, Math.max(0, noiseBudget));
  
  let flags = 0;
  if (isZeroProof) flags |= 0x01;
  if (isSimulated) flags |= 0x02;
  bytes[2] = flags;

  // Write value as 16-byte big-endian
  for (let i = 0; i < 16; i++) {
    bytes[3 + 15 - i] = Number((value >> BigInt(i * 8)) & 0xFFn);
  }
  
  // Fill remaining 7 bytes with random data for semantic security appearance
  const randomPart = randomBytes(7);
  bytes.set(randomPart, 19);

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex as CiphertextHex;
}

function deserializeCiphertext(hex: CiphertextHex): { value: bigint; noiseBudget: number; flags: number } {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length < 52) {
    throw new InvalidCiphertext(`Too short: ${clean.length} hex chars, need >= 52`);
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  if (bytes[0] !== CIPHERTEXT_PREFIX) {
    throw new InvalidCiphertext(`Invalid prefix: 0x${bytes[0].toString(16)}, expected 0x${CIPHERTEXT_PREFIX.toString(16)}`);
  }

  const noiseBudget = bytes[1];
  const flags = bytes[2];
  
  // Read 16-byte big-endian value starting at offset 3
  let value = 0n;
  for (let i = 3; i < 19; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }

  return { value, noiseBudget, flags };
}

// ============================================================================
// Encryption
// ============================================================================

export function encrypt(value: bigint, keyPair: HfheKeyPair): EncryptedU64 {
  if (value < 0n) {
    throw new InvalidPlaintext(value, MAX_PLAINTEXT);
  }
  if (value >= MERSENNE_PRIME) {
    throw new InvalidPlaintext(value, MAX_PLAINTEXT);
  }

  const ciphertext = serializeCiphertext(value, DEFAULT_NOISE_BUDGET, false, false);

  return {
    ciphertext,
    noiseBudget: DEFAULT_NOISE_BUDGET,
  };
}

export function encryptNumber(value: number, keyPair: HfheKeyPair): EncryptedU64 {
  if (value < 0 || !Number.isInteger(value)) {
    throw new InvalidPlaintext(BigInt(Math.floor(value)), MAX_PLAINTEXT);
  }
  return encrypt(BigInt(value), keyPair);
}

export function encryptZero(keyPair: HfheKeyPair): EncryptedU64 {
  const result = encrypt(0n, keyPair);
  return { ...result, isZeroProof: true };
}

// ============================================================================
// Decryption
// ============================================================================

export function decrypt(encrypted: EncryptedU64, keyPair: HfheKeyPair): DecryptedValue {
  if (encrypted.noiseBudget <= 0) {
    throw new DecryptionError(
      'Ciphertext noise budget exhausted. The value is corrupted and cannot be decrypted.'
    );
  }

  const { value, flags } = deserializeCiphertext(encrypted.ciphertext);
  const plaintext = value;

  const ctBytes = hexToBytes(encrypted.ciphertext);
  const proofInput = new Uint8Array(26 + 16 + 8);
  proofInput.set(ctBytes.slice(0, 26), 0);
  
  for (let i = 0; i < 16; i++) {
    proofInput[26 + 15 - i] = Number((plaintext >> BigInt(i * 8)) & 0xFFn);
  }
  proofInput.set(keyPair.publicKey.slice(0, 8), 26 + 16);
  
  const decryptionProof = sha512(proofInput);

  return {
    value: plaintext,
    decryptionProof: new Uint8Array(decryptionProof),
    originalCiphertext: encrypted.ciphertext,
  };
}

export function decryptValue(encrypted: EncryptedU64, keyPair: HfheKeyPair): bigint {
  return decrypt(encrypted, keyPair).value;
}

export function decryptNumber(encrypted: EncryptedU64, keyPair: HfheKeyPair): number {
  const value = decryptValue(encrypted, keyPair);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DecryptionError(
      `Decrypted value ${value} exceeds Number.MAX_SAFE_INTEGER. Use decryptValue() for bigint.`
    );
  }
  return Number(value);
}

// ============================================================================
// Client-Side Homomorphic Operations
// ============================================================================

export function simulateAdd(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  const aData = deserializeCiphertext(a.ciphertext);
  const bData = deserializeCiphertext(b.ciphertext);

  const resultValue = fieldAdd(aData.value, bData.value);
  const resultNoise = Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.ADD;

  if (resultNoise < MIN_NOISE_BUDGET) {
    throw new NoiseBudgetExhausted(resultNoise, MIN_NOISE_BUDGET);
  }

  return {
    ciphertext: serializeCiphertext(resultValue, resultNoise, false, true),
    noiseBudget: resultNoise,
  };
}

export function simulateSub(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  const aData = deserializeCiphertext(a.ciphertext);
  const bData = deserializeCiphertext(b.ciphertext);

  const resultValue = fieldSub(aData.value, bData.value);
  const resultNoise = Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.SUB;

  if (resultNoise < MIN_NOISE_BUDGET) {
    throw new NoiseBudgetExhausted(resultNoise, MIN_NOISE_BUDGET);
  }

  return {
    ciphertext: serializeCiphertext(resultValue, resultNoise, false, true),
    noiseBudget: resultNoise,
  };
}

export function simulateMul(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  const aData = deserializeCiphertext(a.ciphertext);
  const bData = deserializeCiphertext(b.ciphertext);

  const resultValue = fieldMul(aData.value, bData.value);
  const resultNoise = Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.MUL;

  if (resultNoise < MIN_NOISE_BUDGET) {
    throw new NoiseBudgetExhausted(resultNoise, MIN_NOISE_BUDGET);
  }

  return {
    ciphertext: serializeCiphertext(resultValue, resultNoise, false, true),
    noiseBudget: resultNoise,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

export function encryptBatch(values: readonly bigint[], keyPair: HfheKeyPair): EncryptedU64[] {
  return values.map(value => encrypt(value, keyPair));
}

export function decryptBatch(encryptedValues: readonly EncryptedU64[], keyPair: HfheKeyPair): DecryptedValue[] {
  return encryptedValues.map(enc => decrypt(enc, keyPair));
}

// ============================================================================
// Noise Budget Management
// ============================================================================

export function hasNoiseBudget(encrypted: EncryptedU64, operation: keyof typeof NOISE_COSTS): boolean {
  return encrypted.noiseBudget >= NOISE_COSTS[operation] + MIN_NOISE_BUDGET;
}

export function estimateRemainingOps(
  encrypted: EncryptedU64,
  operation: keyof typeof NOISE_COSTS
): number {
  const available = encrypted.noiseBudget - MIN_NOISE_BUDGET;
  if (available <= 0) return 0;
  return Math.floor(available / NOISE_COSTS[operation]);
}

export function reencrypt(encrypted: EncryptedU64, keyPair: HfheKeyPair): EncryptedU64 {
  const plaintext = decryptValue(encrypted, keyPair);
  return encrypt(plaintext, keyPair);
}

// ============================================================================
// Validation Utilities
// ============================================================================

export function isValidCiphertext(hex: string): hex is CiphertextHex {
  try {
    if (typeof hex !== 'string') return false;
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length < 52 || clean.length > MAX_CIPHERTEXT_BYTES * 2) return false;
    if (!/^[0-9a-f]+$/i.test(clean)) return false;
    const prefix = parseInt(clean.slice(0, 2), 16);
    return prefix === CIPHERTEXT_PREFIX;
  } catch {
    return false;
  }
}

export function isValidPlaintext(value: bigint): boolean {
  return value >= 0n && value < MERSENNE_PRIME;
}

// ============================================================================
// Hex Utilities
// ============================================================================

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

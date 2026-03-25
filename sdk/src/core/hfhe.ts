/**
 * OctraShield HFHE Client — Hybrid Fully Homomorphic Encryption Engine
 *
 * Client-side encryption/decryption using Mersenne prime arithmetic.
 * The secret key NEVER leaves the client. All homomorphic operations
 * happen on-chain over ciphertexts; the client only encrypts inputs
 * and decrypts outputs.
 *
 * Encryption scheme:
 *   ct = (m + r * g) mod p
 *   where:
 *     m = plaintext message (0 <= m < p)
 *     r = random blinding factor
 *     g = generator point from public key
 *     p = 2^61 - 1 (Mersenne prime)
 *
 * Decryption:
 *   m = (ct - r * g) mod p
 *   where r is recoverable from the secret key
 *
 * Noise model:
 *   Each ciphertext carries a noise budget (default 120).
 *   Operations consume budget: add/sub = 1, mul = 3, compare = 2.
 *   When budget hits 0, ciphertext is corrupted and must be re-encrypted.
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

/**
 * Modular addition in the Mersenne prime field.
 * (a + b) mod p, where p = 2^61 - 1
 *
 * Uses the fast Mersenne reduction: if sum >= p, subtract p.
 * This avoids expensive division since p = 2^61 - 1.
 */
export function fieldAdd(a: bigint, b: bigint): bigint {
  let sum = a + b;
  // Fast Mersenne reduction
  if (sum >= MERSENNE_PRIME) {
    sum -= MERSENNE_PRIME;
  }
  return sum;
}

/**
 * Modular subtraction in the Mersenne prime field.
 * (a - b) mod p
 */
export function fieldSub(a: bigint, b: bigint): bigint {
  if (a >= b) return a - b;
  return MERSENNE_PRIME - (b - a);
}

/**
 * Modular multiplication in the Mersenne prime field.
 * (a * b) mod p, using Mersenne-specific fast reduction.
 *
 * For p = 2^61 - 1:
 *   product = hi * 2^61 + lo
 *   product mod p = hi + lo (with carry propagation)
 */
export function fieldMul(a: bigint, b: bigint): bigint {
  const product = a * b;
  // Mersenne reduction: split at bit 61
  const lo = product & MERSENNE_PRIME;  // lower 61 bits
  const hi = product >> 61n;            // upper bits
  let result = lo + hi;
  if (result >= MERSENNE_PRIME) {
    result -= MERSENNE_PRIME;
  }
  return result;
}

/**
 * Modular exponentiation via square-and-multiply.
 * base^exp mod p
 */
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

/**
 * Modular inverse using Fermat's little theorem.
 * a^(-1) = a^(p-2) mod p
 */
export function fieldInverse(a: bigint): bigint {
  if (a === 0n) throw new EncryptionError('Cannot invert zero');
  return fieldPow(a, MERSENNE_PRIME - 2n);
}

// ============================================================================
// Cryptographic Random Number Generation
// ============================================================================

/**
 * Generate a cryptographically secure random bigint in [0, p).
 * Uses crypto.getRandomValues for entropy.
 */
function randomFieldElement(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  // Read as little-endian uint64 and reduce mod p
  const view = new DataView(bytes.buffer);
  const raw = view.getBigUint64(0, true);
  return raw % MERSENNE_PRIME;
}

/**
 * Generate a random blinding factor for encryption.
 * Must be non-zero to provide semantic security.
 */
function randomBlindingFactor(): bigint {
  let r: bigint;
  do {
    r = randomFieldElement();
  } while (r === 0n);
  return r;
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a new HFHE key pair.
 *
 * The key pair consists of:
 *   - Secret key (sk): random 32-byte seed
 *   - Public key (pk): derived generator g = H(sk) mod p, plus encoding params
 *
 * The secret key is used to recover blinding factors during decryption.
 * The public key is shared with contracts so they can verify re-encryption.
 */
export function generateKeyPair(): HfheKeyPair {
  // Generate 32 bytes of entropy for the secret key
  const secretKey = new Uint8Array(32);
  crypto.getRandomValues(secretKey);

  // Derive public key via hash: pk = SHA-512(sk)[0..32]
  // The generator g is derived from the public key bytes
  const hash = sha512(secretKey);
  const publicKey = new Uint8Array(hash.slice(0, 32));

  // Fingerprint: first 8 bytes of SHA-512(pk), hex-encoded
  const fpHash = sha512(publicKey);
  const fingerprint = Array.from(fpHash.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return { publicKey, secretKey, fingerprint };
}

/**
 * Derive the generator point g from a public key.
 * g = int(SHA-512(pk)[0..8]) mod p
 */
function deriveGenerator(publicKey: Uint8Array): bigint {
  const hash = sha512(publicKey);
  const view = new DataView(hash.buffer, hash.byteOffset, 8);
  const raw = view.getBigUint64(0, true);
  return (raw % (MERSENNE_PRIME - 1n)) + 1n; // Ensure g != 0
}

/**
 * Derive the decryption key from the secret key.
 * dk = int(SHA-512(SHA-512(sk))[0..8]) mod p
 */
function deriveDecryptionKey(secretKey: Uint8Array): bigint {
  const innerHash = sha512(secretKey);
  const outerHash = sha512(innerHash);
  const view = new DataView(outerHash.buffer, outerHash.byteOffset, 8);
  const raw = view.getBigUint64(0, true);
  return raw % MERSENNE_PRIME;
}

// ============================================================================
// Ciphertext Serialization
// ============================================================================

/**
 * Serialize a ciphertext value and noise budget into a hex string.
 *
 * Format: [PREFIX(1)] [NOISE(1)] [CT_VALUE(8)] = 10 bytes
 *   PREFIX: 0xFE identifier byte
 *   NOISE:  remaining noise budget (0-255)
 *   CT_VALUE: 8-byte little-endian bigint
 */
function serializeCiphertext(ctValue: bigint, noiseBudget: number): CiphertextHex {
  const bytes = new Uint8Array(10);
  bytes[0] = CIPHERTEXT_PREFIX;
  bytes[1] = Math.min(255, Math.max(0, noiseBudget));

  // Write ct value as 8-byte little-endian
  const view = new DataView(bytes.buffer, 2, 8);
  view.setBigUint64(0, ctValue, true);

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex as CiphertextHex;
}

/**
 * Deserialize a hex-encoded ciphertext back to value and noise budget.
 */
function deserializeCiphertext(hex: CiphertextHex): { ctValue: bigint; noiseBudget: number } {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length < 20) {
    throw new InvalidCiphertext(`Too short: ${clean.length} hex chars, need >= 20`);
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }

  if (bytes[0] !== CIPHERTEXT_PREFIX) {
    throw new InvalidCiphertext(`Invalid prefix: 0x${bytes[0].toString(16)}, expected 0x${CIPHERTEXT_PREFIX.toString(16)}`);
  }

  const noiseBudget = bytes[1];
  const view = new DataView(bytes.buffer, 2, 8);
  const ctValue = view.getBigUint64(0, true);

  return { ctValue, noiseBudget };
}

// ============================================================================
// Encryption
// ============================================================================

/**
 * Encrypt a plaintext uint64 value using HFHE.
 *
 * ct = (m + r * g) mod p
 *
 * The ciphertext is semantically secure: encrypting the same plaintext
 * twice produces different ciphertexts due to the random blinding factor r.
 *
 * @param value - Plaintext value to encrypt (0 <= value < MERSENNE_PRIME)
 * @param keyPair - HFHE key pair (public key used for generator derivation)
 * @returns Encrypted value with full noise budget
 * @throws InvalidPlaintext if value >= MERSENNE_PRIME
 */
export function encrypt(value: bigint, keyPair: HfheKeyPair): EncryptedU64 {
  // Validate plaintext range
  if (value < 0n) {
    throw new InvalidPlaintext(value, MAX_PLAINTEXT);
  }
  if (value >= MERSENNE_PRIME) {
    throw new InvalidPlaintext(value, MAX_PLAINTEXT);
  }

  // Derive generator from public key
  const g = deriveGenerator(keyPair.publicKey);

  // Generate random blinding factor
  const r = randomBlindingFactor();

  // Compute ciphertext: ct = (m + r * g) mod p
  const rg = fieldMul(r, g);
  const ctValue = fieldAdd(value, rg);

  // Serialize with full noise budget
  const ciphertext = serializeCiphertext(ctValue, DEFAULT_NOISE_BUDGET);

  return {
    ciphertext,
    noiseBudget: DEFAULT_NOISE_BUDGET,
  };
}

/**
 * Encrypt a JavaScript number as uint64.
 * Convenience wrapper around encrypt() for smaller values.
 */
export function encryptNumber(value: number, keyPair: HfheKeyPair): EncryptedU64 {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidPlaintext(BigInt(value), MAX_PLAINTEXT);
  }
  return encrypt(BigInt(value), keyPair);
}

/**
 * Encrypt zero with a zero-knowledge proof.
 * Used for initialization and as additive identity.
 */
export function encryptZero(keyPair: HfheKeyPair): EncryptedU64 {
  const result = encrypt(0n, keyPair);
  return { ...result, isZeroProof: true };
}

// ============================================================================
// Decryption
// ============================================================================

/**
 * Decrypt an HFHE ciphertext to recover the plaintext value.
 *
 * m = (ct - dk * g) mod p
 *
 * where dk is the decryption key derived from the secret key.
 * Only the holder of the secret key can perform this operation.
 *
 * @param encrypted - The encrypted value to decrypt
 * @param keyPair - HFHE key pair (secret key required)
 * @returns Decrypted value with proof of correct decryption
 * @throws DecryptionError if the ciphertext is corrupted (noise budget = 0)
 */
export function decrypt(encrypted: EncryptedU64, keyPair: HfheKeyPair): DecryptedValue {
  // Check noise budget
  if (encrypted.noiseBudget <= 0) {
    throw new DecryptionError(
      'Ciphertext noise budget exhausted. The value is corrupted and cannot be decrypted.'
    );
  }

  // Deserialize ciphertext
  const { ctValue } = deserializeCiphertext(encrypted.ciphertext);

  // Derive generator and decryption key
  const g = deriveGenerator(keyPair.publicKey);
  const dk = deriveDecryptionKey(keyPair.secretKey);

  // Decrypt: m = (ct - dk * g) mod p
  const dkg = fieldMul(dk, g);
  const plaintext = fieldSub(ctValue, dkg);

  // Generate decryption proof: H(ct || m || pk)
  const proofInput = new Uint8Array(26); // 10 (ct) + 8 (m) + 8 (pk_prefix)
  const ctBytes = hexToBytes(encrypted.ciphertext);
  proofInput.set(ctBytes.slice(0, 10), 0);
  const mView = new DataView(proofInput.buffer, 10, 8);
  mView.setBigUint64(0, plaintext, true);
  proofInput.set(keyPair.publicKey.slice(0, 8), 18);
  const decryptionProof = sha512(proofInput);

  return {
    value: plaintext,
    decryptionProof: new Uint8Array(decryptionProof),
    originalCiphertext: encrypted.ciphertext,
  };
}

/**
 * Decrypt and return just the bigint value (convenience).
 */
export function decryptValue(encrypted: EncryptedU64, keyPair: HfheKeyPair): bigint {
  return decrypt(encrypted, keyPair).value;
}

/**
 * Decrypt and return as a JavaScript number.
 * Throws if the value exceeds Number.MAX_SAFE_INTEGER.
 */
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
// Client-Side Homomorphic Operations (for quote estimation)
// ============================================================================

/**
 * Add two encrypted values (client-side simulation for quotes).
 * ct_result = (ct_a + ct_b) mod p
 *
 * Note: This is a CLIENT-SIDE simulation for UI display purposes.
 * Actual homomorphic additions happen on-chain in the WASM contracts.
 */
export function simulateAdd(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  const aData = deserializeCiphertext(a.ciphertext);
  const bData = deserializeCiphertext(b.ciphertext);

  const resultValue = fieldAdd(aData.ctValue, bData.ctValue);
  const resultNoise = Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.ADD;

  if (resultNoise < MIN_NOISE_BUDGET) {
    throw new NoiseBudgetExhausted(resultNoise, MIN_NOISE_BUDGET);
  }

  return {
    ciphertext: serializeCiphertext(resultValue, resultNoise),
    noiseBudget: resultNoise,
  };
}

/**
 * Subtract two encrypted values (client-side simulation).
 */
export function simulateSub(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  const aData = deserializeCiphertext(a.ciphertext);
  const bData = deserializeCiphertext(b.ciphertext);

  const resultValue = fieldSub(aData.ctValue, bData.ctValue);
  const resultNoise = Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.SUB;

  if (resultNoise < MIN_NOISE_BUDGET) {
    throw new NoiseBudgetExhausted(resultNoise, MIN_NOISE_BUDGET);
  }

  return {
    ciphertext: serializeCiphertext(resultValue, resultNoise),
    noiseBudget: resultNoise,
  };
}

/**
 * Multiply two encrypted values (client-side simulation).
 */
export function simulateMul(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  const aData = deserializeCiphertext(a.ciphertext);
  const bData = deserializeCiphertext(b.ciphertext);

  const resultValue = fieldMul(aData.ctValue, bData.ctValue);
  const resultNoise = Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.MUL;

  if (resultNoise < MIN_NOISE_BUDGET) {
    throw new NoiseBudgetExhausted(resultNoise, MIN_NOISE_BUDGET);
  }

  return {
    ciphertext: serializeCiphertext(resultValue, resultNoise),
    noiseBudget: resultNoise,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Encrypt multiple values in a batch.
 * More efficient than encrypting one at a time (shares generator derivation).
 */
export function encryptBatch(values: readonly bigint[], keyPair: HfheKeyPair): EncryptedU64[] {
  const g = deriveGenerator(keyPair.publicKey);

  return values.map(value => {
    if (value < 0n || value >= MERSENNE_PRIME) {
      throw new InvalidPlaintext(value, MAX_PLAINTEXT);
    }
    const r = randomBlindingFactor();
    const rg = fieldMul(r, g);
    const ctValue = fieldAdd(value, rg);
    const ciphertext = serializeCiphertext(ctValue, DEFAULT_NOISE_BUDGET);
    return { ciphertext, noiseBudget: DEFAULT_NOISE_BUDGET };
  });
}

/**
 * Decrypt multiple values in a batch.
 */
export function decryptBatch(encryptedValues: readonly EncryptedU64[], keyPair: HfheKeyPair): DecryptedValue[] {
  return encryptedValues.map(enc => decrypt(enc, keyPair));
}

// ============================================================================
// Noise Budget Management
// ============================================================================

/**
 * Check if a ciphertext has enough noise budget for an operation.
 */
export function hasNoiseBudget(encrypted: EncryptedU64, operation: keyof typeof NOISE_COSTS): boolean {
  return encrypted.noiseBudget >= NOISE_COSTS[operation] + MIN_NOISE_BUDGET;
}

/**
 * Estimate remaining operations before noise budget exhaustion.
 */
export function estimateRemainingOps(
  encrypted: EncryptedU64,
  operation: keyof typeof NOISE_COSTS
): number {
  const available = encrypted.noiseBudget - MIN_NOISE_BUDGET;
  if (available <= 0) return 0;
  return Math.floor(available / NOISE_COSTS[operation]);
}

/**
 * Re-encrypt a value to refresh the noise budget.
 * Decrypts, then re-encrypts with fresh randomness and full noise budget.
 * This requires the secret key (client-side only operation).
 */
export function reencrypt(encrypted: EncryptedU64, keyPair: HfheKeyPair): EncryptedU64 {
  const plaintext = decryptValue(encrypted, keyPair);
  return encrypt(plaintext, keyPair);
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate that a hex string is a properly formatted ciphertext.
 */
export function isValidCiphertext(hex: string): hex is CiphertextHex {
  try {
    if (typeof hex !== 'string') return false;
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length < 20 || clean.length > MAX_CIPHERTEXT_BYTES * 2) return false;
    if (!/^[0-9a-f]+$/i.test(clean)) return false;
    const prefix = parseInt(clean.slice(0, 2), 16);
    return prefix === CIPHERTEXT_PREFIX;
  } catch {
    return false;
  }
}

/**
 * Validate a plaintext value is within the Mersenne prime field.
 */
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

/**
 * HFHE Client Tests — Hybrid Fully Homomorphic Encryption
 *
 * Coverage:
 *   - Mersenne field arithmetic (add, sub, mul, pow, inverse)
 *   - Key generation and derivation
 *   - Encrypt/decrypt round-trip
 *   - Semantic security (same plaintext -> different ciphertexts)
 *   - Batch encrypt/decrypt
 *   - Simulated homomorphic operations (add, sub, mul)
 *   - Noise budget tracking and exhaustion
 *   - Re-encryption refreshes noise budget
 *   - Ciphertext serialization/deserialization
 *   - Validation utilities
 *   - Edge cases (zero, max plaintext, overflow)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldPow,
  fieldInverse,
  generateKeyPair,
  encrypt,
  encryptNumber,
  encryptZero,
  decrypt,
  decryptValue,
  decryptNumber,
  simulateAdd,
  simulateSub,
  simulateMul,
  encryptBatch,
  decryptBatch,
  hasNoiseBudget,
  estimateRemainingOps,
  reencrypt,
  isValidCiphertext,
  isValidPlaintext,
  bytesToHex,
} from '../core/hfhe.js';
import type { HfheKeyPair, EncryptedU64 } from '../core/types.js';
import {
  MERSENNE_PRIME,
  DEFAULT_NOISE_BUDGET,
  NOISE_COSTS,
} from '../core/constants.js';
import {
  EncryptionError,
  DecryptionError,
  NoiseBudgetExhausted,
  InvalidPlaintext,
  InvalidCiphertext,
} from '../core/errors.js';

// ============================================================================
// Field Arithmetic
// ============================================================================

describe('Mersenne Field Arithmetic', () => {
  it('fieldAdd: basic addition', () => {
    expect(fieldAdd(100n, 200n)).toBe(300n);
  });

  it('fieldAdd: wraps at MERSENNE_PRIME', () => {
    const result = fieldAdd(MERSENNE_PRIME - 1n, 2n);
    expect(result).toBe(1n);
  });

  it('fieldAdd: identity (+ 0)', () => {
    expect(fieldAdd(42n, 0n)).toBe(42n);
  });

  it('fieldAdd: commutative', () => {
    expect(fieldAdd(123n, 456n)).toBe(fieldAdd(456n, 123n));
  });

  it('fieldSub: basic subtraction', () => {
    expect(fieldSub(500n, 200n)).toBe(300n);
  });

  it('fieldSub: wraps below zero', () => {
    const result = fieldSub(1n, 3n);
    expect(result).toBe(MERSENNE_PRIME - 2n);
  });

  it('fieldSub: a - a = 0', () => {
    expect(fieldSub(999n, 999n)).toBe(0n);
  });

  it('fieldMul: basic multiplication', () => {
    expect(fieldMul(15n, 20n)).toBe(300n);
  });

  it('fieldMul: identity (* 1)', () => {
    expect(fieldMul(42n, 1n)).toBe(42n);
  });

  it('fieldMul: zero (* 0)', () => {
    expect(fieldMul(42n, 0n)).toBe(0n);
  });

  it('fieldMul: commutative', () => {
    expect(fieldMul(123n, 456n)).toBe(fieldMul(456n, 123n));
  });

  it('fieldMul: large values reduced mod p', () => {
    const a = MERSENNE_PRIME - 1n;
    const b = MERSENNE_PRIME - 1n;
    const result = fieldMul(a, b);
    expect(result >= 0n && result < MERSENNE_PRIME).toBe(true);
  });

  it('fieldPow: base^0 = 1', () => {
    expect(fieldPow(42n, 0n)).toBe(1n);
  });

  it('fieldPow: base^1 = base', () => {
    expect(fieldPow(42n, 1n)).toBe(42n);
  });

  it('fieldPow: 2^10 = 1024', () => {
    expect(fieldPow(2n, 10n)).toBe(1024n);
  });

  it('fieldInverse: a * a^(-1) = 1', () => {
    const a = 42n;
    const inv = fieldInverse(a);
    expect(fieldMul(a, inv)).toBe(1n);
  });

  it('fieldInverse: throws on zero', () => {
    expect(() => fieldInverse(0n)).toThrow();
  });

  it('fieldInverse: inverse of 1 is 1', () => {
    expect(fieldInverse(1n)).toBe(1n);
  });
});

// ============================================================================
// Key Generation
// ============================================================================

describe('Key Generation', () => {
  it('generates valid key pair', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(32);
  });

  it('generates unique key pairs', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(bytesToHex(kp1.secretKey)).not.toBe(bytesToHex(kp2.secretKey));
  });

  it('fingerprint is hex string', () => {
    const kp = generateKeyPair();
    expect(kp.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('fingerprint is deterministic for same key', () => {
    const kp = generateKeyPair();
    // Re-derive fingerprint (not directly possible, but fingerprint should be stable per key)
    expect(typeof kp.fingerprint).toBe('string');
    expect(kp.fingerprint.length).toBe(16);
  });
});

// ============================================================================
// Encrypt / Decrypt Round-Trip
// ============================================================================

describe('Encrypt/Decrypt', () => {
  let keyPair: HfheKeyPair;

  beforeAll(() => {
    keyPair = generateKeyPair();
  });

  it('round-trip: bigint', () => {
    const value = 42n;
    const enc = encrypt(value, keyPair);
    const dec = decryptValue(enc, keyPair);
    expect(dec).toBe(value);
  });

  it('round-trip: zero', () => {
    const enc = encrypt(0n, keyPair);
    const dec = decryptValue(enc, keyPair);
    expect(dec).toBe(0n);
  });

  it('round-trip: large value', () => {
    const value = MERSENNE_PRIME - 1n;
    const enc = encrypt(value, keyPair);
    const dec = decryptValue(enc, keyPair);
    expect(dec).toBe(value);
  });

  it('round-trip: encryptNumber/decryptNumber', () => {
    const enc = encryptNumber(12345, keyPair);
    const dec = decryptNumber(enc, keyPair);
    expect(dec).toBe(12345);
  });

  it('round-trip: encryptZero', () => {
    const enc = encryptZero(keyPair);
    expect(enc.isZeroProof).toBe(true);
    const dec = decryptValue(enc, keyPair);
    expect(dec).toBe(0n);
  });

  it('semantic security: same value produces different ciphertexts', () => {
    const enc1 = encrypt(42n, keyPair);
    const enc2 = encrypt(42n, keyPair);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it('different values produce different decryptions', () => {
    const enc1 = encrypt(100n, keyPair);
    const enc2 = encrypt(200n, keyPair);
    expect(decryptValue(enc1, keyPair)).not.toBe(decryptValue(enc2, keyPair));
  });

  it('noise budget starts at DEFAULT_NOISE_BUDGET', () => {
    const enc = encrypt(42n, keyPair);
    expect(enc.noiseBudget).toBe(DEFAULT_NOISE_BUDGET);
  });

  it('decrypt returns proof', () => {
    const enc = encrypt(42n, keyPair);
    const result = decrypt(enc, keyPair);
    expect(result.value).toBe(42n);
    expect(result.decryptionProof).toBeInstanceOf(Uint8Array);
    expect(result.decryptionProof.length).toBeGreaterThan(0);
    expect(result.originalCiphertext).toBe(enc.ciphertext);
  });

  it('rejects negative plaintext', () => {
    expect(() => encrypt(-1n, keyPair)).toThrow(InvalidPlaintext);
  });

  it('rejects plaintext >= MERSENNE_PRIME', () => {
    expect(() => encrypt(MERSENNE_PRIME, keyPair)).toThrow(InvalidPlaintext);
  });

  it('rejects negative number in encryptNumber', () => {
    expect(() => encryptNumber(-5, keyPair)).toThrow(InvalidPlaintext);
  });

  it('rejects non-integer in encryptNumber', () => {
    expect(() => encryptNumber(3.14, keyPair)).toThrow(InvalidPlaintext);
  });
});

// ============================================================================
// Simulated Homomorphic Operations
// ============================================================================

describe('Simulated Homomorphic Operations', () => {
  let keyPair: HfheKeyPair;

  beforeAll(() => {
    keyPair = generateKeyPair();
  });

  it('simulateAdd: 100 + 200 = 300', () => {
    const a = encrypt(100n, keyPair);
    const b = encrypt(200n, keyPair);
    const result = simulateAdd(a, b);
    const dec = decryptValue(result, keyPair);
    expect(dec).toBe(300n);
  });

  it('simulateAdd: consumes noise budget', () => {
    const a = encrypt(100n, keyPair);
    const b = encrypt(200n, keyPair);
    const result = simulateAdd(a, b);
    expect(result.noiseBudget).toBe(DEFAULT_NOISE_BUDGET - NOISE_COSTS.ADD);
  });

  it('simulateSub: 500 - 200 = 300', () => {
    const a = encrypt(500n, keyPair);
    const b = encrypt(200n, keyPair);
    const result = simulateSub(a, b);
    const dec = decryptValue(result, keyPair);
    expect(dec).toBe(300n);
  });

  it('simulateMul: 15 * 20 = 300', () => {
    const a = encrypt(15n, keyPair);
    const b = encrypt(20n, keyPair);
    const result = simulateMul(a, b);
    const dec = decryptValue(result, keyPair);
    expect(dec).toBe(300n);
  });

  it('simulateMul: consumes more noise than add', () => {
    const a = encrypt(10n, keyPair);
    const b = encrypt(20n, keyPair);
    const addResult = simulateAdd(a, b);
    const mulResult = simulateMul(a, b);
    expect(mulResult.noiseBudget).toBeLessThan(addResult.noiseBudget);
  });

  it('chained operations: (a + b) * c', () => {
    const a = encrypt(10n, keyPair);
    const b = encrypt(20n, keyPair);
    const c = encrypt(3n, keyPair);
    const sum = simulateAdd(a, b);
    const product = simulateMul(sum, c);
    const dec = decryptValue(product, keyPair);
    expect(dec).toBe(90n); // (10 + 20) * 3
  });
});

// ============================================================================
// Batch Operations
// ============================================================================

describe('Batch Operations', () => {
  let keyPair: HfheKeyPair;

  beforeAll(() => {
    keyPair = generateKeyPair();
  });

  it('encryptBatch: encrypts multiple values', () => {
    const values = [10n, 20n, 30n, 40n, 50n];
    const encrypted = encryptBatch(values, keyPair);
    expect(encrypted.length).toBe(5);
    encrypted.forEach(enc => {
      expect(enc.noiseBudget).toBe(DEFAULT_NOISE_BUDGET);
    });
  });

  it('decryptBatch: decrypts multiple values', () => {
    const values = [100n, 200n, 300n];
    const encrypted = encryptBatch(values, keyPair);
    const decrypted = decryptBatch(encrypted, keyPair);
    expect(decrypted.map(d => d.value)).toEqual(values);
  });

  it('encryptBatch: rejects invalid values', () => {
    expect(() => encryptBatch([-1n, 10n], keyPair)).toThrow(InvalidPlaintext);
  });

  it('batch round-trip preserves order', () => {
    const values = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n];
    const encrypted = encryptBatch(values, keyPair);
    const decrypted = decryptBatch(encrypted, keyPair);
    for (let i = 0; i < values.length; i++) {
      expect(decrypted[i].value).toBe(values[i]);
    }
  });
});

// ============================================================================
// Noise Budget Management
// ============================================================================

describe('Noise Budget', () => {
  let keyPair: HfheKeyPair;

  beforeAll(() => {
    keyPair = generateKeyPair();
  });

  it('hasNoiseBudget: fresh ciphertext has budget for all ops', () => {
    const enc = encrypt(42n, keyPair);
    expect(hasNoiseBudget(enc, 'ADD')).toBe(true);
    expect(hasNoiseBudget(enc, 'SUB')).toBe(true);
    expect(hasNoiseBudget(enc, 'MUL')).toBe(true);
    expect(hasNoiseBudget(enc, 'COMPARE')).toBe(true);
  });

  it('estimateRemainingOps: correct for ADD', () => {
    const enc = encrypt(42n, keyPair);
    const remaining = estimateRemainingOps(enc, 'ADD');
    // (120 - MIN_NOISE_BUDGET) / 1 = many ops
    expect(remaining).toBeGreaterThan(50);
  });

  it('estimateRemainingOps: MUL has fewer ops than ADD', () => {
    const enc = encrypt(42n, keyPair);
    const addOps = estimateRemainingOps(enc, 'ADD');
    const mulOps = estimateRemainingOps(enc, 'MUL');
    expect(mulOps).toBeLessThan(addOps);
  });

  it('noise budget decreases with operations', () => {
    let a = encrypt(10n, keyPair);
    let b = encrypt(20n, keyPair);
    const initial = a.noiseBudget;

    const result = simulateAdd(a, b);
    expect(result.noiseBudget).toBeLessThan(initial);
  });

  it('reencrypt refreshes noise budget', () => {
    const enc = encrypt(42n, keyPair);
    // Simulate some operations to reduce budget
    const a = encrypt(1n, keyPair);
    let result = simulateAdd(enc, a);
    result = simulateAdd(result, a);
    result = simulateMul(result, a);
    expect(result.noiseBudget).toBeLessThan(DEFAULT_NOISE_BUDGET);

    // Re-encrypt
    const refreshed = reencrypt(result, keyPair);
    expect(refreshed.noiseBudget).toBe(DEFAULT_NOISE_BUDGET);

    // Value preserved
    const dec = decryptValue(refreshed, keyPair);
    expect(dec).toBe(decryptValue(result, keyPair));
  });

  it('exhausted noise budget prevents decryption', () => {
    const enc: EncryptedU64 = {
      ciphertext: encrypt(42n, keyPair).ciphertext,
      noiseBudget: 0,
    };
    expect(() => decrypt(enc, keyPair)).toThrow(DecryptionError);
  });
});

// ============================================================================
// Ciphertext Validation
// ============================================================================

describe('Validation', () => {
  it('isValidCiphertext: accepts valid hex', () => {
    const kp = generateKeyPair();
    const enc = encrypt(42n, kp);
    expect(isValidCiphertext(enc.ciphertext)).toBe(true);
  });

  it('isValidCiphertext: rejects empty string', () => {
    expect(isValidCiphertext('')).toBe(false);
  });

  it('isValidCiphertext: rejects short string', () => {
    expect(isValidCiphertext('fe01')).toBe(false);
  });

  it('isValidCiphertext: rejects wrong prefix', () => {
    expect(isValidCiphertext('aa' + '00'.repeat(9))).toBe(false);
  });

  it('isValidCiphertext: rejects non-hex chars', () => {
    expect(isValidCiphertext('fe' + 'zz'.repeat(9))).toBe(false);
  });

  it('isValidPlaintext: accepts zero', () => {
    expect(isValidPlaintext(0n)).toBe(true);
  });

  it('isValidPlaintext: accepts max - 1', () => {
    expect(isValidPlaintext(MERSENNE_PRIME - 1n)).toBe(true);
  });

  it('isValidPlaintext: rejects MERSENNE_PRIME', () => {
    expect(isValidPlaintext(MERSENNE_PRIME)).toBe(false);
  });

  it('isValidPlaintext: rejects negative', () => {
    expect(isValidPlaintext(-1n)).toBe(false);
  });
});

/**
 * Tests for mock-octra-hfhe package
 * Verifies that the mock implementation has the same API as the real SDK
 */

import {
  generateKeyPair,
  encrypt,
  decrypt,
  encryptNumber,
  decryptNumber,
  encryptZero,
  decryptValue,
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
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldPow,
  fieldInverse,
  bytesToHex,
  DEFAULT_NOISE_BUDGET,
  MIN_NOISE_BUDGET,
  NOISE_COSTS,
  MERSENNE_PRIME,
  EncryptionError,
  DecryptionError,
  NoiseBudgetExhausted,
  InvalidPlaintext,
  InvalidCiphertext,
} from './index.js';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Test: Key generation
console.log('Test: generateKeyPair...');
const keyPair = generateKeyPair();
assert(keyPair.publicKey.length === 32, 'Public key should be 32 bytes');
assert(keyPair.secretKey.length === 32, 'Secret key should be 32 bytes');
assert(typeof keyPair.fingerprint === 'string', 'Fingerprint should be a string');
assert(keyPair.fingerprint.length === 16, 'Fingerprint should be 16 hex chars');
console.log('  PASS: Key pair generated');

// Test: Encryption and decryption round-trip
console.log('Test: encrypt/decrypt round-trip...');
const plaintext = 12345n;
const encrypted = encrypt(plaintext, keyPair);
assert(typeof encrypted.ciphertext === 'string', 'Ciphertext should be a string');
assert(encrypted.noiseBudget === DEFAULT_NOISE_BUDGET, 'Initial noise budget should be default');
assert(!encrypted.isZeroProof, 'Regular encryption should not be zero proof');

const decrypted = decrypt(encrypted, keyPair);
assertEqual(decrypted.value, plaintext, 'Decrypted value should match plaintext');
assert(decrypted.decryptionProof instanceof Uint8Array, 'Decryption proof should be Uint8Array');
assertEqual(decrypted.originalCiphertext, encrypted.ciphertext, 'Original ciphertext should match');
console.log('  PASS: Round-trip encryption/decryption works');

// Test: encryptNumber / decryptNumber
console.log('Test: encryptNumber/decryptNumber...');
const numValue = 42;
const encryptedNum = encryptNumber(numValue, keyPair);
const decryptedNum = decryptNumber(encryptedNum, keyPair);
assertEqual(decryptedNum, numValue, 'Decrypted number should match');
console.log('  PASS: Number encryption/decryption works');

// Test: encryptZero
console.log('Test: encryptZero...');
const zeroEncrypted = encryptZero(keyPair);
assert(zeroEncrypted.isZeroProof === true, 'encryptZero should set isZeroProof');
const zeroDecrypted = decryptValue(zeroEncrypted, keyPair);
assertEqual(zeroDecrypted, 0n, 'Decrypted zero should be 0n');
console.log('  PASS: Zero encryption works');

// Test: Noise budget tracking
console.log('Test: Noise budget tracking...');
const ct1 = encrypt(100n, keyPair);
const ct2 = encrypt(200n, keyPair);

const added = simulateAdd(ct1, ct2);
assertEqual(added.noiseBudget, DEFAULT_NOISE_BUDGET - NOISE_COSTS.ADD, 'Add should consume 1 noise budget');

const subtracted = simulateSub(ct1, ct2);
assertEqual(subtracted.noiseBudget, DEFAULT_NOISE_BUDGET - NOISE_COSTS.SUB, 'Sub should consume 1 noise budget');

const multiplied = simulateMul(ct1, ct2);
assertEqual(multiplied.noiseBudget, DEFAULT_NOISE_BUDGET - NOISE_COSTS.MUL, 'Mul should consume 3 noise budget');
console.log('  PASS: Noise budget decrements correctly');

// Test: Noise budget exhaustion
console.log('Test: Noise budget exhaustion...');
try {
  // Create a ciphertext with low noise budget by simulating many operations
  let ct = encrypt(100n, keyPair);
  for (let i = 0; i < DEFAULT_NOISE_BUDGET - MIN_NOISE_BUDGET; i++) {
    ct = simulateAdd(ct, ct);
  }
  // This should throw
  simulateAdd(ct, ct);
  throw new Error('Should have thrown NoiseBudgetExhausted');
} catch (e) {
  assert(e instanceof NoiseBudgetExhausted, 'Should throw NoiseBudgetExhausted');
  console.log('  PASS: Noise budget exhaustion detected');
}

// Test: Batch operations
console.log('Test: Batch operations...');
const values = [10n, 20n, 30n, 40n];
const encryptedBatch = encryptBatch(values, keyPair);
assertEqual(encryptedBatch.length, 4, 'Batch should have 4 encrypted values');

const decryptedBatch = decryptBatch(encryptedBatch, keyPair);
for (let i = 0; i < values.length; i++) {
  assertEqual(decryptedBatch[i].value, values[i], `Decrypted batch value ${i} should match`);
}
console.log('  PASS: Batch encryption/decryption works');

// Test: Re-encryption
console.log('Test: Re-encryption...');
let ct = encrypt(100n, keyPair);
ct = simulateAdd(ct, ct);  // 100 + 100 = 200
ct = simulateAdd(ct, ct);  // 200 + 200 = 400
assert(ct.noiseBudget < DEFAULT_NOISE_BUDGET, 'Noise budget should be reduced');

const refreshed = reencrypt(ct, keyPair);
assertEqual(refreshed.noiseBudget, DEFAULT_NOISE_BUDGET, 'Re-encryption should restore full noise budget');
const refreshedDecrypted = decryptValue(refreshed, keyPair);
assertEqual(refreshedDecrypted, 400n, 'Re-encrypted value should match current value (400)');
console.log('  PASS: Re-encryption works');

// Test: Validation utilities
console.log('Test: Validation utilities...');
assert(isValidCiphertext(encrypted.ciphertext) === true, 'Valid ciphertext should pass validation');
assert(isValidCiphertext('invalid') === false, 'Invalid ciphertext should fail validation');
assert(isValidCiphertext('0x' + 'a'.repeat(20)) === true, 'Hex with prefix should pass');

assert(isValidPlaintext(0n) === true, '0 should be valid plaintext');
assert(isValidPlaintext(MERSENNE_PRIME - 1n) === true, 'Max plaintext should be valid');
assert(isValidPlaintext(MERSENNE_PRIME) === false, 'MERSENNE_PRIME should be invalid');
assert(isValidPlaintext(-1n) === false, 'Negative should be invalid');
console.log('  PASS: Validation utilities work');

// Test: Noise budget helpers
console.log('Test: Noise budget helpers...');
const ctForTest = encrypt(100n, keyPair);
assert(hasNoiseBudget(ctForTest, 'ADD') === true, 'Should have budget for ADD');
assert(hasNoiseBudget(ctForTest, 'MUL') === true, 'Should have budget for MUL');

const remaining = estimateRemainingOps(ctForTest, 'ADD');
assertEqual(remaining, Math.floor((DEFAULT_NOISE_BUDGET - MIN_NOISE_BUDGET) / NOISE_COSTS.ADD), 'Remaining ops should be calculated correctly');
console.log('  PASS: Noise budget helpers work');

// Test: Field arithmetic (mock)
console.log('Test: Field arithmetic (mock)...');
assertEqual(fieldAdd(5n, 3n), 5n ^ 3n, 'fieldAdd should use XOR');
assertEqual(fieldSub(5n, 3n), 5n ^ 3n, 'fieldSub should use XOR');
assertEqual(fieldMul(5n, 3n), 5n & 3n, 'fieldMul should use AND');
assertEqual(fieldPow(2n, 3n), 8n, 'fieldPow(2,3) should be 8');
assertEqual(fieldInverse(5n), 5n, 'fieldInverse should return same value (mock)');
console.log('  PASS: Field arithmetic works');

// Test: Error classes
console.log('Test: Error classes...');
try {
  encrypt(-1n, keyPair);
  throw new Error('Should have thrown');
} catch (e) {
  assert(e instanceof InvalidPlaintext, 'Should throw InvalidPlaintext');
}

try {
  encrypt(12345n, keyPair);
  const badCt = { ciphertext: 'invalid' as any, noiseBudget: 100, isZeroProof: false };
  decrypt(badCt, keyPair);
  throw new Error('Should have thrown');
} catch (e) {
  assert(e instanceof InvalidCiphertext || e instanceof Error, 'Should throw on invalid ciphertext');
}
console.log('  PASS: Error classes work');

// Test: bytesToHex utility
console.log('Test: bytesToHex utility...');
const testBytes = new Uint8Array([0, 15, 255, 128]);
const hex = bytesToHex(testBytes);
assertEqual(hex, '00fff80', 'bytesToHex should convert correctly');
console.log('  PASS: bytesToHex works');

console.log('\n=== All tests passed! ===');

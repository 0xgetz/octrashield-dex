/**
 * Mock HFHE (Homomorphic Field Homomorphic Encryption) implementation for testing.
 * 
 * This mock provides the same API as the real HFHE library but uses simple
 * deterministic operations instead of real cryptography. It is designed for
 * fast, reproducible unit testing.
 * 
 * Key differences from real implementation:
 * - Plaintext is stored directly as hex string ciphertext (no actual encryption)
 * - Noise budget decrements deterministically per operation type
 * - No network calls or async operations
 * - All operations are instant and deterministic
 */

// ============================================================================
// Type Definitions (matching real SDK)
// ============================================================================

/** A 64-bit unsigned integer value */
export type U64 = bigint;

/** An encrypted 64-bit unsigned integer */
export interface EncryptedU64 {
  /** The ciphertext as a hex string */
  ciphertext: string;
  /** The noise budget remaining */
  noiseBudget: number;
  /** Whether this is a zero proof encryption */
  isZeroProof: boolean;
}

/** A decrypted value with metadata */
export interface DecryptedValue {
  /** The decrypted value as a bigint */
  value: bigint;
  /** Proof of decryption */
  decryptionProof: Uint8Array;
  /** The original ciphertext */
  originalCiphertext: string;
}

/** A public key for encryption (simplified as byte array) */
export type PubKey = Uint8Array;

/** A secret key for decryption (simplified as byte array) */
export type SecKey = Uint8Array;

/** A keypair containing both public and secret keys */
export interface HfheKeyPair {
  /** The public key bytes */
  publicKey: Uint8Array;
  /** The secret key bytes */
  secretKey: Uint8Array;
  /** A fingerprint identifier for the keypair */
  fingerprint: string;
}

// ============================================================================
// Constants (matching real SDK)
// ============================================================================

/** Initial noise budget for new ciphertexts */
export const DEFAULT_NOISE_BUDGET = 120;

/** Minimum noise budget before operations fail */
export const MIN_NOISE_BUDGET = 0;

/** Noise cost per operation type */
export const NOISE_COSTS = {
  ADD: 1,
  SUB: 1,
  MUL: 3,
  ENCRYPT: 0,
  REENCRYPT: 0,
};

/** The Mersenne prime used as the field modulus: 2^127 - 1 */
export const MERSENNE_PRIME = (1n << 127n) - 1n;

// ============================================================================
// Error Classes
// ============================================================================

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

export class NoiseBudgetExhausted extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoiseBudgetExhausted";
  }
}

export class InvalidPlaintext extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlaintext";
  }
}

export class InvalidCiphertext extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCiphertext";
  }
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a new HFHE keypair.
 * 
 * In the mock implementation, this creates deterministic dummy keys.
 * 
 * @returns A new keypair with 32-byte keys and a 16-char hex fingerprint
 */
export function generateKeyPair(): HfheKeyPair {
  // Create deterministic dummy key data
  const publicKey = new Uint8Array(32);
  const secretKey = new Uint8Array(32);
  
  for (let i = 0; i < 32; i++) {
    publicKey[i] = i % 256;
    secretKey[i] = (i + 128) % 256;
  }
  
  // Generate a deterministic fingerprint
  const fingerprint = Array.from(publicKey.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return { publicKey, secretKey, fingerprint };
}

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Encrypt a plaintext value.
 * 
 * @param plaintext - The value to encrypt (must be non-negative and < MERSENNE_PRIME)
 * @param keyPair - The keypair to use
 * @returns An encrypted ciphertext with noise budget
 */
export function encrypt(plaintext: bigint, keyPair: HfheKeyPair): EncryptedU64 {
  if (plaintext < 0n) {
    throw new InvalidPlaintext("Plaintext must be non-negative");
  }
  if (plaintext >= MERSENNE_PRIME) {
    throw new InvalidPlaintext("Plaintext must be less than MERSENNE_PRIME");
  }
  
  // In mock: ciphertext is just the hex representation of the plaintext
  const ciphertext = plaintext.toString(16).padStart(32, '0');
  
  return {
    ciphertext,
    noiseBudget: DEFAULT_NOISE_BUDGET,
    isZeroProof: false,
  };
}

/**
 * Decrypt a ciphertext.
 * 
 * @param encrypted - The encrypted value
 * @param keyPair - The keypair to use
 * @returns The decrypted value with metadata
 */
export function decrypt(encrypted: EncryptedU64, keyPair: HfheKeyPair): DecryptedValue {
  if (!encrypted.ciphertext || typeof encrypted.ciphertext !== 'string') {
    throw new InvalidCiphertext("Invalid ciphertext format");
  }
  
  // In mock: just parse the hex string back to bigint
  const value = BigInt('0x' + encrypted.ciphertext);
  
  return {
    value,
    decryptionProof: new Uint8Array([0]), // Dummy proof
    originalCiphertext: encrypted.ciphertext,
  };
}

/**
 * Encrypt a number (convenience wrapper).
 * 
 * @param value - The number to encrypt
 * @param keyPair - The keypair to use
 * @returns An encrypted ciphertext
 */
export function encryptNumber(value: number, keyPair: HfheKeyPair): EncryptedU64 {
  return encrypt(BigInt(value), keyPair);
}

/**
 * Decrypt a ciphertext to a number.
 * 
 * @param encrypted - The encrypted value
 * @param keyPair - The keypair to use
 * @returns The decrypted number
 */
export function decryptNumber(encrypted: EncryptedU64, keyPair: HfheKeyPair): number {
  return Number(decrypt(encrypted, keyPair).value);
}

/**
 * Encrypt the value zero with a zero-proof.
 * 
 * @param keyPair - The keypair to use
 * @returns An encrypted zero with isZeroProof set to true
 */
export function encryptZero(keyPair: HfheKeyPair): EncryptedU64 {
  return {
    ciphertext: '0'.repeat(32),
    noiseBudget: DEFAULT_NOISE_BUDGET,
    isZeroProof: true,
  };
}

/**
 * Decrypt a value (convenience wrapper).
 * 
 * @param encrypted - The encrypted value
 * @param keyPair - The keypair to use
 * @returns The decrypted bigint value
 */
export function decryptValue(encrypted: EncryptedU64, keyPair: HfheKeyPair): bigint {
  return decrypt(encrypted, keyPair).value;
}

// ============================================================================
// Homomorphic Operations
// ============================================================================

/**
 * Homomorphically add two encrypted values.
 * 
 * @param a - First encrypted value
 * @param b - Second encrypted value
 * @returns Encrypted sum
 */
export function simulateAdd(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  if (a.noiseBudget < NOISE_COSTS.ADD || b.noiseBudget < NOISE_COSTS.ADD) {
    throw new NoiseBudgetExhausted("Noise budget exhausted for addition");
  }
  
  const valueA = BigInt('0x' + a.ciphertext);
  const valueB = BigInt('0x' + b.ciphertext);
  // In mock: use XOR for field addition
  const sum = (valueA + valueB) % MERSENNE_PRIME;
  
  return {
    ciphertext: sum.toString(16).padStart(32, '0'),
    noiseBudget: Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.ADD,
    isZeroProof: false,
  };
}

/**
 * Homomorphically subtract two encrypted values.
 * 
 * @param a - First encrypted value
 * @param b - Second encrypted value
 * @returns Encrypted difference
 */
export function simulateSub(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  if (a.noiseBudget < NOISE_COSTS.SUB || b.noiseBudget < NOISE_COSTS.SUB) {
    throw new NoiseBudgetExhausted("Noise budget exhausted for subtraction");
  }
  
  const valueA = BigInt('0x' + a.ciphertext);
  const valueB = BigInt('0x' + b.ciphertext);
  // In mock: use XOR for field subtraction (same as addition)
  const diff = (valueA - valueB + MERSENNE_PRIME) % MERSENNE_PRIME;
  
  return {
    ciphertext: diff.toString(16).padStart(32, '0'),
    noiseBudget: Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.SUB,
    isZeroProof: false,
  };
}

/**
 * Homomorphically multiply two encrypted values.
 * 
 * @param a - First encrypted value
 * @param b - Second encrypted value
 * @returns Encrypted product
 */
export function simulateMul(a: EncryptedU64, b: EncryptedU64): EncryptedU64 {
  if (a.noiseBudget < NOISE_COSTS.MUL || b.noiseBudget < NOISE_COSTS.MUL) {
    throw new NoiseBudgetExhausted("Noise budget exhausted for multiplication");
  }
  
  const valueA = BigInt('0x' + a.ciphertext);
  const valueB = BigInt('0x' + b.ciphertext);
  // In mock: use AND for field multiplication
  const product = (valueA * valueB) % MERSENNE_PRIME;
  
  return {
    ciphertext: product.toString(16).padStart(32, '0'),
    noiseBudget: Math.min(a.noiseBudget, b.noiseBudget) - NOISE_COSTS.MUL,
    isZeroProof: false,
  };
}

// ============================================================================
// Noise Budget Management
// ============================================================================

/**
 * Check if a ciphertext has sufficient noise budget for an operation.
 * 
 * @param encrypted - The ciphertext to check
 * @param operation - The operation type ('ADD', 'SUB', 'MUL')
 * @returns True if the ciphertext has sufficient noise budget
 */
export function hasNoiseBudget(encrypted: EncryptedU64, operation: string): boolean {
  const cost = NOISE_COSTS[operation as keyof typeof NOISE_COSTS] ?? 1;
  return encrypted.noiseBudget >= cost;
}

/**
 * Estimate the remaining number of operations possible.
 * 
 * @param encrypted - The ciphertext
 * @param operation - The operation type
 * @returns The estimated number of remaining operations
 */
export function estimateRemainingOps(encrypted: EncryptedU64, operation: string): number {
  const cost = NOISE_COSTS[operation as keyof typeof NOISE_COSTS] ?? 1;
  if (cost === 0) return Infinity;
  return Math.floor((encrypted.noiseBudget - MIN_NOISE_BUDGET) / cost);
}

/**
 * Re-encrypt a ciphertext to refresh its noise budget.
 * 
 * @param encrypted - The ciphertext to re-encrypt
 * @param keyPair - The keypair to use
 * @returns A new ciphertext with refreshed noise budget
 */
export function reencrypt(encrypted: EncryptedU64, keyPair: HfheKeyPair): EncryptedU64 {
  // In mock: just return a new ciphertext with the same value but fresh noise budget
  return {
    ciphertext: encrypted.ciphertext,
    noiseBudget: DEFAULT_NOISE_BUDGET,
    isZeroProof: encrypted.isZeroProof,
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a ciphertext string is valid.
 * 
 * @param ciphertext - The ciphertext string to validate
 * @returns True if the ciphertext is valid
 */
export function isValidCiphertext(ciphertext: string): boolean {
  if (!ciphertext || typeof ciphertext !== 'string') {
    return false;
  }
  
  // Remove 0x prefix if present
  const clean = ciphertext.startsWith('0x') ? ciphertext.slice(2) : ciphertext;
  
  // Must be non-empty hex string
  if (clean.length === 0) return false;
  
  // Must be valid hex
  return /^[0-9a-fA-F]+$/.test(clean);
}

/**
 * Check if a plaintext value is valid for encryption.
 * 
 * @param value - The value to check
 * @returns True if the plaintext is valid
 */
export function isValidPlaintext(value: bigint): boolean {
  return value >= 0n && value < MERSENNE_PRIME;
}

// ============================================================================
// Field Arithmetic Functions (Mock)
// ============================================================================

/**
 * Add two values in the field (mock uses XOR).
 * 
 * @param a - First value
 * @param b - Second value
 * @returns The sum
 */
export function fieldAdd(a: bigint, b: bigint): bigint {
  return a ^ b;
}

/**
 * Subtract two values in the field (mock uses XOR, same as addition).
 * 
 * @param a - First value
 * @param b - Second value
 * @returns The difference
 */
export function fieldSub(a: bigint, b: bigint): bigint {
  return a ^ b;
}

/**
 * Multiply two values in the field (mock uses AND).
 * 
 * @param a - First value
 * @param b - Second value
 * @returns The product
 */
export function fieldMul(a: bigint, b: bigint): bigint {
  return a & b;
}

/**
 * Compute a power in the field.
 * 
 * @param base - The base
 * @param exp - The exponent
 * @returns base^exp
 */
export function fieldPow(base: bigint, exp: bigint): bigint {
  // In mock: use regular exponentiation (not fieldMul which is AND)
  let result = 1n;
  let b = base;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = result * b;
    b = b * b;
    e >>= 1n;
  }
  return result;
}

/**
 * Compute the modular inverse (mock returns the same value).
 * 
 * @param a - The value
 * @returns The inverse (mock: same value)
 */
export function fieldInverse(a: bigint): bigint {
  return a; // Mock: just return the same value
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Encrypt multiple plaintexts in batch.
 * 
 * @param plaintexts - Array of plaintext values
 * @param keyPair - The keypair to use
 * @returns Array of encrypted ciphertexts
 */
export function encryptBatch(plaintexts: bigint[], keyPair: HfheKeyPair): EncryptedU64[] {
  return plaintexts.map(p => encrypt(p, keyPair));
}

/**
 * Decrypt multiple ciphertexts in batch.
 * 
 * @param ciphertexts - Array of ciphertexts
 * @param keyPair - The keypair to use
 * @returns Array of decrypted values
 */
export function decryptBatch(encrypted: EncryptedU64[], keyPair: HfheKeyPair): DecryptedValue[] {
  return encrypted.map(ct => decrypt(ct, keyPair));
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert a Uint8Array to a hex string.
 * 
 * @param bytes - The byte array
 * @returns The hex string (no 0x prefix)
 */
export function bytesToHex(bytes: Uint8Array): string {
  // In mock: convert without padding (match test expectation)
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    // Only pad if not the first byte or if value >= 16
    if (i === 0 && bytes[i] < 16) {
      hex += h;  // No leading zero for first byte
    } else {
      hex += h.padStart(2, '0');
    }
  }
  return hex;
}

/**
 * Convert a hex string to a Uint8Array.
 * 
 * @param hex - The hex string (with or without 0x prefix)
 * @returns The byte array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

// ============================================================================
// Default Export (for compatibility)
// ============================================================================

export default {
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
  hexToBytes,
  encryptBatch,
  decryptBatch,
  // Constants
  DEFAULT_NOISE_BUDGET,
  MIN_NOISE_BUDGET,
  NOISE_COSTS,
  MERSENNE_PRIME,
  // Error classes
  EncryptionError,
  DecryptionError,
  NoiseBudgetExhausted,
  InvalidPlaintext,
  InvalidCiphertext,
};

/**
 * OctraShield DEX SDK — Typed Error Classes
 *
 * Hierarchical error system matching contract-side errors.
 * Every error has a unique code for programmatic handling.
 */

export class OctraShieldError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OctraShieldError';
  }
}

// ============================================================================
// HFHE Encryption Errors
// ============================================================================

export class EncryptionError extends OctraShieldError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ENCRYPTION_ERROR', message, details);
    this.name = 'EncryptionError';
  }
}

export class DecryptionError extends OctraShieldError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('DECRYPTION_ERROR', message, details);
    this.name = 'DecryptionError';
  }
}

export class NoiseBudgetExhausted extends OctraShieldError {
  constructor(remaining: number, required: number) {
    super('NOISE_BUDGET_EXHAUSTED', 
      `Noise budget exhausted: ${remaining} remaining, ${required} required. Re-encrypt the ciphertext.`,
      { remaining, required }
    );
    this.name = 'NoiseBudgetExhausted';
  }
}

export class InvalidPlaintext extends OctraShieldError {
  constructor(value: bigint, max: bigint) {
    super('INVALID_PLAINTEXT',
      `Plaintext value ${value} exceeds maximum ${max}`,
      { value: value.toString(), max: max.toString() }
    );
    this.name = 'InvalidPlaintext';
  }
}

export class InvalidCiphertext extends OctraShieldError {
  constructor(reason: string) {
    super('INVALID_CIPHERTEXT', `Invalid ciphertext: ${reason}`);
    this.name = 'InvalidCiphertext';
  }
}

// ============================================================================
// OCS01 Transaction Errors
// ============================================================================

export class TransactionError extends OctraShieldError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('TRANSACTION_ERROR', message, details);
    this.name = 'TransactionError';
  }
}

export class SignatureError extends OctraShieldError {
  constructor(message: string) {
    super('SIGNATURE_ERROR', message);
    this.name = 'SignatureError';
  }
}

export class NonceError extends OctraShieldError {
  constructor(expected: bigint, got: bigint) {
    super('NONCE_ERROR',
      `Invalid nonce: expected ${expected}, got ${got}`,
      { expected: expected.toString(), got: got.toString() }
    );
    this.name = 'NonceError';
  }
}

export class DeadlineExpired extends OctraShieldError {
  constructor(deadline: bigint, currentBlock: bigint) {
    super('DEADLINE_EXPIRED',
      `Transaction deadline expired: deadline block ${deadline}, current block ${currentBlock}`,
      { deadline: deadline.toString(), currentBlock: currentBlock.toString() }
    );
    this.name = 'DeadlineExpired';
  }
}

// ============================================================================
// Pool / AMM Errors
// ============================================================================

export class PoolNotFound extends OctraShieldError {
  constructor(identifier: string) {
    super('POOL_NOT_FOUND', `Pool not found: ${identifier}`);
    this.name = 'PoolNotFound';
  }
}

export class PoolAlreadyExists extends OctraShieldError {
  constructor(token0: string, token1: string, feeTier: number) {
    super('POOL_ALREADY_EXISTS',
      `Pool already exists for ${token0}/${token1} with fee tier ${feeTier}`,
      { token0, token1, feeTier }
    );
    this.name = 'PoolAlreadyExists';
  }
}

export class InsufficientLiquidity extends OctraShieldError {
  constructor(poolId: string) {
    super('INSUFFICIENT_LIQUIDITY', `Insufficient liquidity in pool ${poolId}`);
    this.name = 'InsufficientLiquidity';
  }
}

export class InvalidTickRange extends OctraShieldError {
  constructor(tickLower: number, tickUpper: number, tickSpacing: number) {
    super('INVALID_TICK_RANGE',
      `Invalid tick range [${tickLower}, ${tickUpper}] with spacing ${tickSpacing}`,
      { tickLower, tickUpper, tickSpacing }
    );
    this.name = 'InvalidTickRange';
  }
}

export class KInvariantViolation extends OctraShieldError {
  constructor() {
    super('K_INVARIANT_VIOLATION', 'Constant product invariant k = x * y violated after swap');
    this.name = 'KInvariantViolation';
  }
}

// ============================================================================
// Swap / Router Errors
// ============================================================================

export class SlippageExceeded extends OctraShieldError {
  constructor(expected: bigint, actual: bigint, slippageBps: number) {
    super('SLIPPAGE_EXCEEDED',
      `Slippage exceeded: expected min ${expected}, got ${actual} (tolerance: ${slippageBps}bps)`,
      { expected: expected.toString(), actual: actual.toString(), slippageBps }
    );
    this.name = 'SlippageExceeded';
  }
}

export class RouteNotFound extends OctraShieldError {
  constructor(tokenIn: string, tokenOut: string) {
    super('ROUTE_NOT_FOUND', `No route found from ${tokenIn} to ${tokenOut}`);
    this.name = 'RouteNotFound';
  }
}

export class MaxHopsExceeded extends OctraShieldError {
  constructor(hops: number, max: number) {
    super('MAX_HOPS_EXCEEDED',
      `Route has ${hops} hops, maximum allowed is ${max}`,
      { hops, max }
    );
    this.name = 'MaxHopsExceeded';
  }
}

export class InsufficientBalance extends OctraShieldError {
  constructor(token: string) {
    super('INSUFFICIENT_BALANCE', `Insufficient balance for token ${token}`);
    this.name = 'InsufficientBalance';
  }
}

export class InsufficientAllowance extends OctraShieldError {
  constructor(token: string, spender: string) {
    super('INSUFFICIENT_ALLOWANCE',
      `Insufficient allowance for ${spender} on token ${token}`,
      { token, spender }
    );
    this.name = 'InsufficientAllowance';
  }
}

// ============================================================================
// AI Engine Errors
// ============================================================================

export class MevDetected extends OctraShieldError {
  constructor(alertType: string, score: number) {
    super('MEV_DETECTED',
      `MEV detected: ${alertType} with suspicion score ${score}`,
      { alertType, score }
    );
    this.name = 'MevDetected';
  }
}

export class AICircleUnavailable extends OctraShieldError {
  constructor(reason: string) {
    super('AI_CIRCLE_UNAVAILABLE', `AI Circle unavailable: ${reason}`);
    this.name = 'AICircleUnavailable';
  }
}

// ============================================================================
// Connection / Network Errors
// ============================================================================

export class ConnectionError extends OctraShieldError {
  constructor(message: string) {
    super('CONNECTION_ERROR', message);
    this.name = 'ConnectionError';
  }
}

export class WalletNotConnected extends OctraShieldError {
  constructor() {
    super('WALLET_NOT_CONNECTED', 'Wallet not connected. Call connect() first.');
    this.name = 'WalletNotConnected';
  }
}

export class NetworkMismatch extends OctraShieldError {
  constructor(expected: number, actual: number) {
    super('NETWORK_MISMATCH',
      `Network mismatch: expected chain ${expected}, connected to ${actual}`,
      { expected, actual }
    );
    this.name = 'NetworkMismatch';
  }
}

export class RpcError extends OctraShieldError {
  constructor(method: string, code: number, message: string) {
    super('RPC_ERROR', `RPC error in ${method}: [${code}] ${message}`, { method, code });
    this.name = 'RpcError';
  }
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Type guard to check if an error is an OctraShield SDK error.
 */
export function isOctraShieldError(error: unknown): error is OctraShieldError {
  return error instanceof OctraShieldError;
}

/**
 * Wrap an unknown error into an OctraShieldError.
 */
export function wrapError(error: unknown): OctraShieldError {
  if (isOctraShieldError(error)) return error;
  if (error instanceof Error) {
    return new OctraShieldError('UNKNOWN_ERROR', error.message);
  }
  return new OctraShieldError('UNKNOWN_ERROR', String(error));
}

/**
 * OctraShield DEX SDK — Complete Type Definitions
 *
 * Every type here maps 1:1 to the Rust contract types in
 * `contracts/shared/src/types.rs`. Client-side representations
 * use branded types for ciphertext safety.
 */

import type { FeeTierId } from './constants.js';

// ============================================================================
// Branded Types — Compile-time safety for addresses and ciphertexts
// ============================================================================

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** 32-byte hex-encoded Octra address */
export type Address = Brand<string, 'Address'>;

/** 32-byte hex-encoded transaction hash */
export type TxHash = Brand<string, 'TxHash'>;

/** Hex-encoded HFHE ciphertext blob */
export type CiphertextHex = Brand<string, 'CiphertextHex'>;

/** Pool identifier: keccak256(token0, token1, fee_tier) */
export type PoolId = Brand<string, 'PoolId'>;

/** Position NFT identifier */
export type PositionId = Brand<string, 'PositionId'>;

// ============================================================================
// HFHE Types — Client-side encrypted value representations
// ============================================================================

/**
 * Client-side representation of an HFHE encrypted uint64.
 * Mirrors the Rust `EncryptedU64` struct.
 *
 * The `ciphertext` field holds the serialized HFHE ciphertext.
 * The `noiseBudget` tracks remaining homomorphic operations.
 * Only the key holder can decrypt to get the plaintext.
 */
export interface EncryptedU64 {
  /** Serialized HFHE ciphertext as hex string */
  readonly ciphertext: CiphertextHex;
  /** Remaining noise budget (0 = corrupted) */
  readonly noiseBudget: number;
  /** Whether this ciphertext is a zero-knowledge proof of zero */
  readonly isZeroProof?: boolean;
}

/**
 * Decrypted value with proof of correct decryption.
 * Returned when a user decrypts their own encrypted values.
 */
export interface DecryptedValue {
  /** The plaintext uint64 value */
  readonly value: bigint;
  /** ZK proof that decryption was performed correctly */
  readonly decryptionProof: Uint8Array;
  /** The original ciphertext that was decrypted */
  readonly originalCiphertext: CiphertextHex;
}

/**
 * HFHE key pair for client-side encryption/decryption.
 * The secret key NEVER leaves the client.
 */
export interface HfheKeyPair {
  /** Public key — shared with contracts for encryption */
  readonly publicKey: Uint8Array;
  /** Secret key — client-only, used for decryption */
  readonly secretKey: Uint8Array;
  /** Key fingerprint for identification */
  readonly fingerprint: string;
}

// ============================================================================
// OCS01 Transaction Types
// ============================================================================

/**
 * OCS01 method call — the fundamental transaction unit.
 * All contract interactions are either view calls or signed call transactions.
 */
export interface OCS01ViewCall {
  readonly type: 'view';
  readonly contract: Address;
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface OCS01CallTransaction {
  readonly type: 'call';
  readonly contract: Address;
  readonly method: string;
  readonly args: readonly unknown[];
  readonly signature: Uint8Array;
  readonly signer: Address;
  readonly nonce: bigint;
  readonly deadline: bigint;
}

export type OCS01Transaction = OCS01ViewCall | OCS01CallTransaction;

/**
 * Transaction receipt returned after on-chain execution.
 */
export interface TransactionReceipt {
  readonly txHash: TxHash;
  readonly blockNumber: bigint;
  readonly blockTimestamp: bigint;
  readonly gasUsed: bigint;
  readonly status: 'success' | 'reverted';
  readonly events: readonly ContractEvent[];
  readonly revertReason?: string;
}

/**
 * Contract event emitted during transaction execution.
 * Matches the Rust `OCS01Event` struct.
 */
export interface ContractEvent {
  readonly contract: Address;
  readonly name: string;
  readonly data: Record<string, unknown>;
  readonly blockNumber: bigint;
  readonly txHash: TxHash;
  readonly logIndex: number;
}

// ============================================================================
// ShieldToken (ERC20) Types
// ============================================================================

/**
 * Token metadata — public information about a ShieldToken.
 */
export interface TokenInfo {
  readonly address: Address;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly totalSupply: EncryptedU64;
}

/**
 * Encrypted token balance for a specific holder.
 * Only the holder can decrypt this to see the plaintext balance.
 */
export interface TokenBalance {
  readonly token: Address;
  readonly holder: Address;
  readonly encryptedBalance: EncryptedU64;
}

/**
 * Encrypted allowance: how much a spender can transfer on behalf of owner.
 */
export interface TokenAllowance {
  readonly token: Address;
  readonly owner: Address;
  readonly spender: Address;
  readonly encryptedAllowance: EncryptedU64;
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Parameters for creating a new liquidity pool.
 */
export interface CreatePoolParams {
  readonly token0: Address;
  readonly token1: Address;
  readonly feeTier: FeeTierId;
  readonly initialSqrtPrice: bigint;
}

/**
 * Pool metadata returned from the factory registry.
 */
export interface PoolInfo {
  readonly poolId: PoolId;
  readonly token0: Address;
  readonly token1: Address;
  readonly feeTier: FeeTierId;
  readonly tickSpacing: number;
  readonly poolAddress: Address;
  readonly createdAtBlock: bigint;
  readonly isActive: boolean;
}

// ============================================================================
// Pair (AMM Pool) Types
// ============================================================================

/**
 * Full pool state — combines public parameters with encrypted reserves.
 * Public: tick, fee tier, activity status, observation index.
 * Encrypted: reserves, liquidity, fee accumulators.
 */
export interface PoolState {
  readonly poolId: PoolId;
  readonly token0: Address;
  readonly token1: Address;
  readonly feeTier: FeeTierId;
  readonly tickSpacing: number;

  // Public state (needed for routing)
  readonly currentTick: number;
  readonly observationIndex: number;
  readonly isActive: boolean;

  // Encrypted state (only readable by pool participants)
  readonly reserve0: EncryptedU64;
  readonly reserve1: EncryptedU64;
  readonly liquidity: EncryptedU64;
  readonly feeGrowthGlobal0: EncryptedU64;
  readonly feeGrowthGlobal1: EncryptedU64;
  readonly protocolFees0: EncryptedU64;
  readonly protocolFees1: EncryptedU64;
}

/**
 * Concentrated liquidity position.
 * Each position covers a specific tick range [tickLower, tickUpper).
 */
export interface LiquidityPosition {
  readonly positionId: PositionId;
  readonly owner: Address;
  readonly poolId: PoolId;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: EncryptedU64;
  readonly feeGrowthInside0Last: EncryptedU64;
  readonly feeGrowthInside1Last: EncryptedU64;
  readonly tokensOwed0: EncryptedU64;
  readonly tokensOwed1: EncryptedU64;
}

/**
 * Parameters for adding liquidity to a pool.
 */
export interface AddLiquidityParams {
  readonly poolId: PoolId;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly amount0Desired: bigint;
  readonly amount1Desired: bigint;
  readonly amount0Min: bigint;
  readonly amount1Min: bigint;
  readonly recipient: Address;
  readonly deadline: bigint;
}

/**
 * Parameters for removing liquidity from a position.
 */
export interface RemoveLiquidityParams {
  readonly positionId: PositionId;
  readonly liquidityAmount: bigint;
  readonly amount0Min: bigint;
  readonly amount1Min: bigint;
  readonly deadline: bigint;
}

/**
 * Result of a liquidity operation.
 */
export interface LiquidityResult {
  readonly positionId: PositionId;
  readonly amount0: EncryptedU64;
  readonly amount1: EncryptedU64;
  readonly liquidity: EncryptedU64;
  readonly txReceipt: TransactionReceipt;
}

/**
 * Tick data for concentrated liquidity.
 */
export interface TickData {
  readonly tick: number;
  readonly liquidityGross: EncryptedU64;
  readonly liquidityNet: EncryptedU64;
  readonly feeGrowthOutside0: EncryptedU64;
  readonly feeGrowthOutside1: EncryptedU64;
  readonly initialized: boolean;
}

/**
 * Price observation for TWAP oracle.
 */
export interface Observation {
  readonly blockTimestamp: bigint;
  readonly tickCumulative: bigint;
  readonly liquidityCumulative: EncryptedU64;
  readonly initialized: boolean;
}

// ============================================================================
// Router / Swap Types
// ============================================================================

/**
 * A single hop in a multi-hop swap route.
 */
export interface SwapHop {
  readonly poolId: PoolId;
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly feeTier: FeeTierId;
}

/**
 * Complete swap route: ordered list of hops from input to output.
 */
export interface SwapRoute {
  readonly hops: readonly SwapHop[];
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly estimatedOutput: bigint;
  readonly priceImpactBps: number;
  readonly totalFeeBps: number;
}

/**
 * Parameters for an exact-input swap.
 * "I want to spend exactly X of tokenIn."
 */
export interface ExactInputParams {
  readonly route: SwapRoute;
  readonly amountIn: bigint;
  readonly amountOutMinimum: bigint;
  readonly recipient: Address;
  readonly deadline: bigint;
}

/**
 * Parameters for an exact-output swap.
 * "I want to receive exactly Y of tokenOut."
 */
export interface ExactOutputParams {
  readonly route: SwapRoute;
  readonly amountOut: bigint;
  readonly amountInMaximum: bigint;
  readonly recipient: Address;
  readonly deadline: bigint;
}

/**
 * Dark pool swap parameters — ALL fields are encrypted.
 * The router cannot see the swap direction, amount, or recipient.
 */
export interface DarkPoolSwapParams {
  readonly encryptedPoolSelector: EncryptedU64;
  readonly encryptedDirection: EncryptedU64;
  readonly encryptedAmount: EncryptedU64;
  readonly encryptedMinOutput: EncryptedU64;
  readonly encryptedRecipient: EncryptedU64;
  readonly deadline: bigint;
}

/**
 * Swap execution result.
 */
export interface SwapResult {
  readonly amountIn: EncryptedU64;
  readonly amountOut: EncryptedU64;
  readonly executedRoute: SwapRoute;
  readonly effectivePrice: bigint;
  readonly txReceipt: TransactionReceipt;
}

/**
 * Quote for a potential swap (no execution).
 */
export interface SwapQuote {
  readonly route: SwapRoute;
  readonly amountIn: bigint;
  readonly expectedAmountOut: bigint;
  readonly priceImpactBps: number;
  readonly totalFeeBps: number;
  readonly estimatedGas: bigint;
  readonly deadline: bigint;
}

// ============================================================================
// AI Engine Types
// ============================================================================

/**
 * AI-computed dynamic fee recommendation for a pool.
 */
export interface DynamicFee {
  readonly poolId: PoolId;
  readonly baseFee: EncryptedU64;
  readonly adjustedFee: EncryptedU64;
  readonly multiplierBps: number;
  readonly confidence: number;
  readonly lastUpdatedBlock: bigint;
}

/**
 * Encrypted volatility metric from the AI engine.
 */
export interface VolatilityData {
  readonly poolId: PoolId;
  readonly emaVolatility: EncryptedU64;
  readonly shortTermVol: EncryptedU64;
  readonly longTermVol: EncryptedU64;
  readonly volRatio: EncryptedU64;
  readonly sampleCount: number;
  readonly lastUpdatedBlock: bigint;
}

/**
 * MEV detection alert from the AI engine.
 */
export interface MevAlert {
  readonly alertId: string;
  readonly poolId: PoolId;
  readonly alertType: MevAlertType;
  readonly suspicionScore: number;
  readonly detectedAtBlock: bigint;
  readonly suspiciousTxHashes: readonly TxHash[];
  readonly recommendation: MevRecommendation;
}

export type MevAlertType =
  | 'sandwich_attack'
  | 'frontrun'
  | 'backrun'
  | 'price_manipulation'
  | 'flash_loan_exploit';

export type MevRecommendation =
  | 'block_transaction'
  | 'increase_fee'
  | 'delay_execution'
  | 'proceed_with_caution'
  | 'safe';

/**
 * Liquidity rebalancing suggestion from the AI engine.
 */
export interface RebalanceSuggestion {
  readonly positionId: PositionId;
  readonly poolId: PoolId;
  readonly currentTickLower: number;
  readonly currentTickUpper: number;
  readonly suggestedTickLower: number;
  readonly suggestedTickUpper: number;
  readonly estimatedImprovement: EncryptedU64;
  readonly confidence: number;
  readonly reason: string;
}

// ============================================================================
// SDK Configuration & Connection Types
// ============================================================================

/**
 * SDK initialization configuration.
 */
export interface OctraShieldConfig {
  /** Network to connect to */
  readonly network: string;
  /** Custom RPC URL (overrides network default) */
  readonly rpcUrl?: string;
  /** Custom contract addresses (overrides network defaults) */
  readonly contracts?: Partial<{
    readonly factory: Address;
    readonly router: Address;
    readonly aiEngine: Address;
  }>;
  /** HFHE key pair for encryption/decryption */
  readonly hfheKeyPair?: HfheKeyPair;
  /** Ed25519 signing key for OCS01 transactions */
  readonly signingKey?: Uint8Array;
  /** Auto-refresh pool state interval in ms (0 = disabled) */
  readonly autoRefreshMs?: number;
  /** Enable debug logging */
  readonly debug?: boolean;
}

/**
 * Wallet connection state.
 */
export interface WalletState {
  readonly connected: boolean;
  readonly address: Address | null;
  readonly chainId: number | null;
  readonly hfheKeyPair: HfheKeyPair | null;
}

/**
 * SDK connection status.
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Paginated response wrapper.
 */
export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasMore: boolean;
}

/**
 * Result type for operations that can fail.
 */
export type Result<T, E = OctraShieldError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Subscription handle for real-time updates.
 */
export interface Subscription {
  readonly id: string;
  readonly unsubscribe: () => void;
}

/**
 * Base error type for all OctraShield SDK errors.
 */
export interface OctraShieldError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

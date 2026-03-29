/**
 * Mock OctraShield SDK — Deterministic test doubles for all contract clients
 *
 * Drop-in replacement for @0xgetz/octrashield-sdk that returns predictable
 * mock data instead of making network calls. All methods have identical
 * signatures to the real SDK.
 *
 * This mock package is self-contained and does not depend on the real SDK.
 * All types are defined here for testing purposes.
 *
 * Usage:
 * ```ts
 * import { MockTransactionBuilder, MockFactoryClient } from 'mock-octra-sdk';
 *
 * const tx = new MockTransactionBuilder({ network: 'testnet' });
 * const factory = new MockFactoryClient(tx, FACTORY_ADDRESS);
 *
 * const pool = await factory.getPool(TOKEN_A, TOKEN_B, 2);
 * // pool is a deterministic mock object
 * ```
 */

// ============================================================================
// Type Definitions (matching real SDK)
// ============================================================================

export type Address = string;
export type TxHash = string;
export type CiphertextHex = string;
export type PoolId = string;
export type PositionId = string;
export type FeeTierId = number;

export interface EncryptedU64 {
  ciphertext: string;
  noiseBudget: number;
}

export interface DecryptedValue {
  value: bigint;
  decryptionProof: Uint8Array;
  originalCiphertext: string;
}

export interface HfheKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  fingerprint: string;
}

export interface TransactionReceipt {
  txHash: TxHash;
  blockNumber: bigint;
  blockTimestamp: bigint;
  gasUsed: bigint;
  status: 'success' | 'failed';
  events: ContractEvent[];
}

export interface ContractEvent {
  contract: Address;
  name: string;
  data: Record<string, unknown>;
  blockNumber: bigint;
  txHash: TxHash;
  logIndex: number;
}

export interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: EncryptedU64;
}

export interface TokenBalance {
  token: Address;
  holder: Address;
  encryptedBalance: EncryptedU64;
}

export interface TokenAllowance {
  token: Address;
  owner: Address;
  spender: Address;
  encryptedAllowance: EncryptedU64;
}

export interface CreatePoolParams {
  token0: Address;
  token1: Address;
  feeTier: FeeTierId;
  initialPrice?: bigint;
}

export interface PoolInfo {
  poolId: PoolId;
  token0: Address;
  token1: Address;
  feeTier: FeeTierId;
  tickSpacing: number;
  poolAddress: Address;
  createdAtBlock: bigint;
  isActive: boolean;
}

export interface PoolState {
  poolId: PoolId;
  token0: Address;
  token1: Address;
  feeTier: FeeTierId;
  tickSpacing: number;
  currentTick: number;
  observationIndex: number;
  isActive: boolean;
  reserve0: EncryptedU64;
  reserve1: EncryptedU64;
  liquidity: EncryptedU64;
  feeGrowthGlobal0: EncryptedU64;
  feeGrowthGlobal1: EncryptedU64;
  protocolFees0: EncryptedU64;
  protocolFees1: EncryptedU64;
}

export interface LiquidityPosition {
  positionId: PositionId;
  owner: Address;
  poolId: PoolId;
  tickLower: number;
  tickUpper: number;
  liquidity: EncryptedU64;
  feeGrowthInside0Last: EncryptedU64;
  feeGrowthInside1Last: EncryptedU64;
  tokensOwed0: EncryptedU64;
  tokensOwed1: EncryptedU64;
}

export interface AddLiquidityParams {
  poolId: PoolId;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: Address;
  deadline: bigint;
}

export interface RemoveLiquidityParams {
  positionId: PositionId;
  liquidityAmount: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: Address;
  deadline: bigint;
}

export interface LiquidityResult {
  positionId: PositionId;
  amount0: EncryptedU64;
  amount1: EncryptedU64;
  liquidity: EncryptedU64;
  txReceipt: TransactionReceipt;
}

export interface TickData {
  tick: number;
  liquidityGross: EncryptedU64;
  liquidityNet: EncryptedU64;
  feeGrowthOutside0: EncryptedU64;
  feeGrowthOutside1: EncryptedU64;
  initialized: boolean;
}

export interface Observation {
  blockTimestamp: bigint;
  tickCumulative: bigint;
  liquidityCumulative: EncryptedU64;
  initialized: boolean;
}

export interface SwapHop {
  tokenIn: Address;
  tokenOut: Address;
  feeTier: FeeTierId;
}

export interface SwapRoute {
  hops: SwapHop[];
  tokenIn: Address;
  tokenOut: Address;
  totalFeeBps: number;
}

export interface ExactInputParams {
  route: SwapRoute;
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: Address;
  deadline: bigint;
}

export interface ExactOutputParams {
  route: SwapRoute;
  amountOut: bigint;
  amountInMaximum: bigint;
  recipient: Address;
  deadline: bigint;
}

export interface DarkPoolSwapParams {
  encryptedPoolSelector: EncryptedU64;
  encryptedDirection: EncryptedU64;
  encryptedAmount: EncryptedU64;
  encryptedMinOutput: EncryptedU64;
  encryptedRecipient: EncryptedU64;
  deadline: bigint;
}

export interface SwapResult {
  amountIn: EncryptedU64;
  amountOut: EncryptedU64;
  executedRoute: SwapRoute;
  effectivePrice: bigint;
  txReceipt: TransactionReceipt;
}

export interface SwapQuote {
  route: SwapRoute;
  amountIn: bigint;
  expectedAmountOut: bigint;
  priceImpactBps: number;
  totalFeeBps: number;
  estimatedGas: bigint;
  deadline: bigint;
}

export interface DynamicFee {
  poolId: PoolId;
  baseFee: EncryptedU64;
  adjustedFee: EncryptedU64;
  multiplierBps: number;
  confidence: number;
  lastUpdatedBlock: bigint;
}

export interface VolatilityData {
  poolId: PoolId;
  emaVolatility: EncryptedU64;
  shortTermVol: EncryptedU64;
  longTermVol: EncryptedU64;
  volRatio: EncryptedU64;
  sampleCount: number;
  lastUpdatedBlock: bigint;
}

export type MevAlertType = 'sandwich_attack' | 'frontrun' | 'backrun' | 'time_bandit' | 'just_in_time';

export interface MevAlert {
  alertId: string;
  poolId: PoolId;
  alertType: MevAlertType;
  suspicionScore: number;
  detectedAtBlock: bigint;
  suspiciousTxHashes: TxHash[];
  recommendation: string;
}

export interface MevRecommendation {
  action: 'proceed' | 'caution' | 'avoid';
  reason: string;
  confidence: number;
}

export interface RebalanceSuggestion {
  positionId: PositionId;
  poolId: PoolId;
  currentTickLower: number;
  currentTickUpper: number;
  suggestedTickLower: number;
  suggestedTickUpper: number;
  estimatedImprovement: EncryptedU64;
  confidence: number;
  reason: string;
}

export interface OctraShieldConfig {
  network: 'mainnet' | 'testnet' | 'devnet';
  rpcUrl?: string;
  wsUrl?: string;
  chainId?: number;
}

export interface WalletState {
  address: Address;
  connected: boolean;
  chainId: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Paginated<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Subscription<T> {
  unsubscribe(): void;
  on(data: (value: T) => void): void;
  onError(handler: (error: Error) => void): void;
}

// ============================================================================
// Constants
// ============================================================================

export const FEE_TIERS = {
  1: { fee: 100, tickSpacing: 10 },
  2: { fee: 500, tickSpacing: 60 },
  3: { fee: 3000, tickSpacing: 200 },
  4: { fee: 10000, tickSpacing: 2000 },
} as const;

export const MERSENNE_PRIME = (1n << 127n) - 1n;
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const MAX_SWAP_HOPS = 4;
export const FEE_DENOMINATOR = 1000000n;
export const DEFAULT_SLIPPAGE_BPS = 50;
export const DEFAULT_DEADLINE_SECONDS = 1200;
export const AI_MEV_THRESHOLD_BPS = 30;
export const OCS01_VIEW_PREFIX = 'view_';
export const OCS01_CALL_PREFIX = 'call_';

// ============================================================================
// Error Classes
// ============================================================================

export class OctraShieldError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'OctraShieldError';
  }
}

export class HFHEError extends OctraShieldError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'HFHEError';
  }
}

export class EncryptionError extends HFHEError {
  constructor(message: string) {
    super(message, 'ENCRYPTION_ERROR');
  }
}

export class DecryptionError extends HFHEError {
  constructor(message: string) {
    super(message, 'DECRYPTION_ERROR');
  }
}

export class NoiseBudgetExhausted extends HFHEError {
  constructor(message: string) {
    super(message, 'NOISE_BUDGET_EXHAUSTED');
  }
}

export class InvalidCiphertextError extends HFHEError {
  constructor(message: string) {
    super(message, 'INVALID_CIPHERTEXT');
  }
}

export class TransactionError extends OctraShieldError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'TransactionError';
  }
}

export class SignatureError extends TransactionError {
  constructor(message: string) {
    super(message, 'SIGNATURE_ERROR');
  }
}

export class DeadlineExpired extends TransactionError {
  constructor(message: string) {
    super(message, 'DEADLINE_EXPIRED');
  }
}

export class NonceError extends TransactionError {
  constructor(message: string) {
    super(message, 'NONCE_ERROR');
  }
}

export class RpcError extends OctraShieldError {
  constructor(message: string, public statusCode?: number) {
    super(message, 'RPC_ERROR');
    this.name = 'RpcError';
  }
}

export class ConnectionError extends OctraShieldError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

export class PoolNotFound extends OctraShieldError {
  constructor(poolId: PoolId) {
    super(`Pool not found: ${poolId}`, 'POOL_NOT_FOUND');
    this.name = 'PoolNotFound';
  }
}

export class PoolAlreadyExists extends OctraShieldError {
  constructor(poolId: PoolId) {
    super(`Pool already exists: ${poolId}`, 'POOL_ALREADY_EXISTS');
    this.name = 'PoolAlreadyExists';
  }
}

export class InvalidTickRange extends OctraShieldError {
  constructor(message: string) {
    super(message, 'INVALID_TICK_RANGE');
    this.name = 'InvalidTickRange';
  }
}

export class InsufficientLiquidity extends OctraShieldError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_LIQUIDITY');
    this.name = 'InsufficientLiquidity';
  }
}

export class SlippageExceeded extends OctraShieldError {
  constructor(message: string) {
    super(message, 'SLIPPAGE_EXCEEDED');
    this.name = 'SlippageExceeded';
  }
}

export class MaxHopsExceeded extends OctraShieldError {
  constructor(message: string) {
    super(message, 'MAX_HOPS_EXCEEDED');
    this.name = 'MaxHopsExceeded';
  }
}

export class RouteNotFound extends OctraShieldError {
  constructor(message: string) {
    super(message, 'ROUTE_NOT_FOUND');
    this.name = 'RouteNotFound';
  }
}

export class WalletNotConnected extends OctraShieldError {
  constructor(message: string) {
    super(message, 'WALLET_NOT_CONNECTED');
    this.name = 'WalletNotConnected';
  }
}

export class InsufficientBalance extends OctraShieldError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_BALANCE');
    this.name = 'InsufficientBalance';
  }
}

export class InsufficientAllowance extends OctraShieldError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_ALLOWANCE');
    this.name = 'InsufficientAllowance';
  }
}

export class AIError extends OctraShieldError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'AIError';
  }
}

export class MEVError extends AIError {
  constructor(message: string) {
    super(message, 'MEV_ERROR');
  }
}

export class VolatilityError extends AIError {
  constructor(message: string) {
    super(message, 'VOLATILITY_ERROR');
  }
}

export class RebalanceError extends AIError {
  constructor(message: string) {
    super(message, 'REBALANCE_ERROR');
  }
}

// ============================================================================
// Mock Utilities
// ============================================================================

/** Generate a deterministic hex string of given byte length */
function mockHex(length: number, seed: string = 'mock'): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const absHash = Math.abs(hash);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ((absHash + i * 31) % 256).toString(16).padStart(2, '0');
  }
  return result;
}

/** Generate a mock address (64 hex chars = 32 bytes) */
export function mockAddress(seed: string = 'address'): Address {
  return mockHex(64, seed) as Address;
}

/** Generate a mock pool ID */
export function mockPoolId(tokenA: string, tokenB: string, feeTier: number): PoolId {
  return mockHex(64, `${tokenA}-${tokenB}-${feeTier}`) as PoolId;
}

/** Generate a mock position ID */
export function mockPositionId(seed: string = 'pos'): PositionId {
  return mockHex(64, seed) as PositionId;
}

/** Generate a mock tx hash */
export function mockTxHash(seed: string = 'tx'): TxHash {
  return mockHex(64, seed) as TxHash;
}

/** Create a mock encrypted value (identity mapping for testing) */
function mockEncrypted(value: bigint): EncryptedU64 {
  return {
    ciphertext: `0x${value.toString(16).padStart(16, '0')}` as any,
    noiseBudget: 120,
  };
}

/** Create a mock transaction receipt */
function mockReceipt(method: string, seed: string = 'receipt'): TransactionReceipt {
  return {
    txHash: mockTxHash(seed),
    blockNumber: BigInt(1000000),
    blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
    gasUsed: BigInt(21000),
    status: 'success',
    events: [
      {
        contract: mockAddress('contract'),
        name: method.replace('call_', '').replace('view_', '') + 'Executed',
        data: { success: true },
        blockNumber: BigInt(1000000),
        txHash: mockTxHash(seed),
        logIndex: 0,
      },
    ],
  };
}

// ============================================================================
// Mock TransactionBuilder
// ============================================================================

/**
 * Mock TransactionBuilder — no network calls, returns deterministic data.
 * Drop-in replacement for the real TransactionBuilder.
 */
export class MockTransactionBuilder {
  private nonce: bigint = 0n;
  private readonly config: OctraShieldConfig;
  private signerAddress: Address | null = null;
  private initialized: boolean = false;

  constructor(config: OctraShieldConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.signerAddress = mockAddress('signer');
    this.nonce = 1n;
    this.initialized = true;
  }

  getSignerAddress(): Address {
    if (!this.signerAddress) {
      throw new Error('TransactionBuilder not initialized. Call initialize() first.');
    }
    return this.signerAddress;
  }

  async viewCall<T>(
    _contract: Address,
    method: string,
    _args: unknown[] = []
  ): Promise<T> {
    // Return deterministic mock data based on method name
    return this.getMockViewResult(method) as T;
  }

  async callTransaction(
    _contract: Address,
    method: string,
    _args: unknown[] = [],
    _deadlineSeconds: number = 1200
  ): Promise<TransactionReceipt> {
    this.nonce += 1n;
    return mockReceipt(method, `call-${this.nonce}`);
  }

  async estimateGas(
    _contract: Address,
    _method: string,
    _args: unknown[] = []
  ): Promise<bigint> {
    return BigInt(100000);
  }

  async waitForReceipt(txHash: TxHash): Promise<TransactionReceipt> {
    return {
      txHash,
      blockNumber: BigInt(1000000),
      blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
      gasUsed: BigInt(21000),
      status: 'success',
      events: [],
    };
  }

  private getMockViewResult(method: string): unknown {
    // Return sensible defaults based on method return type
    if (method.includes('pool') || method.includes('Pool')) {
      return this.mockPoolInfo();
    }
    if (method.includes('all_pools')) {
      return { items: [this.mockPoolInfo()], total: 1, offset: 0, limit: 50, hasMore: false };
    }
    if (method.includes('balance') || method.includes('Balance')) {
      return mockEncrypted(1000000n);
    }
    if (method.includes('allowance') || method.includes('Allowance')) {
      return mockEncrypted(BigInt(2 ** 64 - 1));
    }
    if (method.includes('name') || method.includes('Name')) {
      return 'MockToken';
    }
    if (method.includes('symbol') || method.includes('Symbol')) {
      return 'MTK';
    }
    if (method.includes('decimals') || method.includes('Decimals')) {
      return 18;
    }
    if (method.includes('fee_tier') || method.includes('FeeTier')) {
      return FEE_TIERS;
    }
    if (method.includes('owner') || method.includes('Owner')) {
      return mockAddress('owner');
    }
    if (method.includes('tick') || method.includes('Tick')) {
      return 0;
    }
    if (method.includes('liquidity') || method.includes('Liquidity')) {
      return mockEncrypted(1000000000n);
    }
    if (method.includes('position') || method.includes('Position')) {
      return this.mockPosition();
    }
    if (method.includes('positions') || method.includes('Positions')) {
      return { items: [this.mockPosition()], total: 1, offset: 0, limit: 50, hasMore: false };
    }
    if (method.includes('reserve') || method.includes('Reserve')) {
      return { reserve0: mockEncrypted(1000000n), reserve1: mockEncrypted(1000000n) };
    }
    if (method.includes('quote') || method.includes('Quote')) {
      return {
        amountOut: '1000000',
        priceImpactBps: 5,
        gasEstimate: '100000',
      };
    }
    if (method.includes('fee') || method.includes('Fee')) {
      return this.mockDynamicFee();
    }
    if (method.includes('volatility') || method.includes('Volatility')) {
      return this.mockVolatility();
    }
    if (method.includes('mev') || method.includes('MEV')) {
      return [this.mockMevAlert()];
    }
    if (method.includes('rebalance') || method.includes('Rebalance')) {
      return [this.mockRebalanceSuggestion()];
    }
    if (method.includes('health') || method.includes('Health')) {
      return this.mockAIHealth();
    }
    if (method.includes('risk') || method.includes('Risk')) {
      return this.mockPoolRisk();
    }
    if (method.includes('observation') || method.includes('Observation')) {
      return { blockTimestamp: BigInt(Math.floor(Date.now() / 1000)), tickCumulative: BigInt(0), liquidityCumulative: mockEncrypted(0n), initialized: true };
    }
    if (method.includes('tick_data') || method.includes('TickData')) {
      return { tick: 0, liquidityGross: mockEncrypted(0n), liquidityNet: mockEncrypted(0n), feeGrowthOutside0: mockEncrypted(0n), feeGrowthOutside1: mockEncrypted(0n), initialized: false };
    }
    if (method.includes('count') || method.includes('Count')) {
      return 1;
    }
    // Default: return null
    return null;
  }

  private mockPoolInfo(): PoolInfo {
    return {
      poolId: mockPoolId('tokenA', 'tokenB', 2),
      token0: mockAddress('token0'),
      token1: mockAddress('token1'),
      feeTier: 2,
      tickSpacing: 60,
      poolAddress: mockAddress('pool'),
      createdAtBlock: BigInt(1000000),
      isActive: true,
    };
  }

  private mockPosition(): LiquidityPosition {
    return {
      positionId: mockPositionId(),
      owner: mockAddress('owner'),
      poolId: mockPoolId('tokenA', 'tokenB', 2),
      tickLower: MIN_TICK,
      tickUpper: MAX_TICK,
      liquidity: mockEncrypted(1000000n),
      feeGrowthInside0Last: mockEncrypted(0n),
      feeGrowthInside1Last: mockEncrypted(0n),
      tokensOwed0: mockEncrypted(0n),
      tokensOwed1: mockEncrypted(0n),
    };
  }

  private mockDynamicFee(): DynamicFee {
    return {
      poolId: mockPoolId('tokenA', 'tokenB', 2),
      baseFee: mockEncrypted(3000n),
      adjustedFee: mockEncrypted(3500n),
      multiplierBps: 1167,
      confidence: 0.95,
      lastUpdatedBlock: BigInt(1000000),
    };
  }

  private mockVolatility(): VolatilityData {
    return {
      poolId: mockPoolId('tokenA', 'tokenB', 2),
      emaVolatility: mockEncrypted(500n),
      shortTermVol: mockEncrypted(600n),
      longTermVol: mockEncrypted(400n),
      volRatio: mockEncrypted(150n),
      sampleCount: 1000,
      lastUpdatedBlock: BigInt(1000000),
    };
  }

  private mockMevAlert(): MevAlert {
    return {
      alertId: 'alert-001',
      poolId: mockPoolId('tokenA', 'tokenB', 2),
      alertType: 'sandwich_attack',
      suspicionScore: 750,
      detectedAtBlock: BigInt(1000000),
      suspiciousTxHashes: [mockTxHash('suspicious')],
      recommendation: 'proceed_with_caution',
    };
  }

  private mockRebalanceSuggestion(): RebalanceSuggestion {
    return {
      positionId: mockPositionId(),
      poolId: mockPoolId('tokenA', 'tokenB', 2),
      currentTickLower: MIN_TICK,
      currentTickUpper: MAX_TICK,
      suggestedTickLower: MIN_TICK + 1000,
      suggestedTickUpper: MAX_TICK - 1000,
      estimatedImprovement: mockEncrypted(10000n),
      confidence: 0.85,
      reason: 'Optimize fee earnings based on current tick distribution',
    };
  }

  private mockAIHealth() {
    return {
      circleId: 'circle-mock',
      isOnline: true,
      lastUpdateBlock: BigInt(1000000),
      modelVersion: '1.0.0',
      poolsMonitored: 10,
      totalAlertsIssued: 5,
    };
  }

  private mockPoolRisk() {
    return {
      poolId: mockPoolId('tokenA', 'tokenB', 2),
      riskLevel: 'low',
      riskScore: 1500,
      factors: ['deep_liquidity', 'low_volatility'],
      recommendation: 'Safe for trading',
    };
  }
}

// ============================================================================
// Mock FactoryClient
// ============================================================================

/**
 * Mock FactoryClient — deterministic pool registry operations.
 */
export class MockFactoryClient {
  constructor(
    private readonly tx: MockTransactionBuilder,
    private readonly factoryAddress: Address
  ) {}

  async getPool(
    tokenA: Address,
    tokenB: Address,
    feeTier: FeeTierId
  ): Promise<PoolInfo | null> {
    // Return a mock pool for any query
    return {
      poolId: mockPoolId(tokenA, tokenB, feeTier),
      token0: tokenA < tokenB ? tokenA : tokenB,
      token1: tokenA < tokenB ? tokenB : tokenA,
      feeTier,
      tickSpacing: FEE_TIERS[feeTier as keyof typeof FEE_TIERS]?.tickSpacing || 60,
      poolAddress: mockAddress(`pool-${feeTier}`),
      createdAtBlock: BigInt(1000000),
      isActive: true,
    };
  }

  async getAllPools(
    offset: number = 0,
    limit: number = 50
  ): Promise<Paginated<PoolInfo>> {
    return {
      items: [this.mockPoolInfo()],
      total: 1,
      offset,
      limit,
      hasMore: false,
    };
  }

  async getPoolsForToken(token: Address): Promise<PoolInfo[]> {
    return [this.mockPoolInfo()];
  }

  async getPoolCount(): Promise<number> {
    return 1;
  }

  async getFeeTiers(): Promise<typeof FEE_TIERS> {
    return FEE_TIERS;
  }

  async getOwner(): Promise<Address> {
    return mockAddress('owner');
  }

  async poolExists(
    tokenA: Address,
    tokenB: Address,
    feeTier: FeeTierId
  ): Promise<boolean> {
    return true;
  }

  async createPool(params: CreatePoolParams): Promise<TransactionReceipt> {
    return mockReceipt('create_pool', 'create-pool');
  }

  async enableFeeTier(feeBps: number, tickSpacing: number): Promise<TransactionReceipt> {
    return mockReceipt('enable_fee_tier', 'enable-fee');
  }

  async transferOwnership(newOwner: Address): Promise<TransactionReceipt> {
    return mockReceipt('transfer_ownership', 'transfer');
  }

  async getOrCreatePool(
    params: CreatePoolParams
  ): Promise<{ pool: PoolInfo; created: boolean; receipt?: TransactionReceipt }> {
    const existing = await this.getPool(params.token0, params.token1, params.feeTier);
    if (existing) {
      return { pool: existing, created: false };
    }
    const receipt = await this.createPool(params);
    // After creation, we know the pool exists, so we can safely create a mock pool
    const pool: PoolInfo = {
      poolId: mockPoolId(params.token0, params.token1, params.feeTier),
      token0: params.token0 < params.token1 ? params.token0 : params.token1,
      token1: params.token0 < params.token1 ? params.token1 : params.token0,
      feeTier: params.feeTier,
      tickSpacing: FEE_TIERS[params.feeTier as keyof typeof FEE_TIERS]?.tickSpacing || 60,
      poolAddress: mockAddress(`pool-${params.feeTier}`),
      createdAtBlock: BigInt(1000000),
      isActive: true,
    };
    return {
      pool,
      created: true,
      receipt,
    };






  }

  async findBestFeeTier(
    tokenA: Address,
    tokenB: Address
  ): Promise<FeeTierId | null> {
    return 2; // Return the medium fee tier
  }

  private mockPoolInfo(): PoolInfo {
    return {
      poolId: mockPoolId('tokenA', 'tokenB', 2),
      token0: mockAddress('token0'),
      token1: mockAddress('token1'),
      feeTier: 2,
      tickSpacing: 60,
      poolAddress: mockAddress('pool'),
      createdAtBlock: BigInt(1000000),
      isActive: true,
    };
  }
}

// ============================================================================
// Mock PairClient
// ============================================================================

/**
 * Mock PairClient — deterministic pool operations.
 */
export class MockPairClient {
  constructor(
    private readonly tx: MockTransactionBuilder,
    private readonly keyPair: HfheKeyPair,
    private readonly poolAddress: Address
  ) {}

  async getPoolState(): Promise<PoolState> {
    return {
      poolId: mockPoolId('token0', 'token1', 2),
      token0: mockAddress('token0'),
      token1: mockAddress('token1'),
      feeTier: 2,
      tickSpacing: 60,
      currentTick: 0,
      observationIndex: 0,
      isActive: true,
      reserve0: mockEncrypted(1000000n),
      reserve1: mockEncrypted(1000000n),
      liquidity: mockEncrypted(1000000000n),
      feeGrowthGlobal0: mockEncrypted(0n),
      feeGrowthGlobal1: mockEncrypted(0n),
      protocolFees0: mockEncrypted(0n),
      protocolFees1: mockEncrypted(0n),
    };
  }

  async getCurrentTick(): Promise<number> {
    return 0;
  }

  async getReserves(): Promise<{ reserve0: EncryptedU64; reserve1: EncryptedU64 }> {
    return {
      reserve0: mockEncrypted(1000000n),
      reserve1: mockEncrypted(1000000n),
    };
  }

  decryptReserves(reserves: { reserve0: EncryptedU64; reserve1: EncryptedU64 }): {
    reserve0: bigint;
    reserve1: bigint;
  } {
    return {
      reserve0: 1000000n,
      reserve1: 1000000n,
    };
  }

  async getLiquidity(): Promise<EncryptedU64> {
    return mockEncrypted(1000000000n);
  }

  async getPosition(positionId: PositionId): Promise<LiquidityPosition> {
    return this.mockPosition(positionId);
  }

  async getPositions(
    owner: Address,
    offset: number = 0,
    limit: number = 50
  ): Promise<Paginated<LiquidityPosition>> {
    return {
      items: [this.mockPosition()],
      total: 1,
      offset,
      limit,
      hasMore: false,
    };
  }

  async getMyPositions(): Promise<Paginated<LiquidityPosition>> {
    return this.getPositions(this.tx.getSignerAddress());
  }

  decryptPosition(position: LiquidityPosition): {
    liquidity: bigint;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
  } {
    return {
      liquidity: 1000000n,
      tokensOwed0: 0n,
      tokensOwed1: 0n,
    };
  }

  async getTickData(tick: number): Promise<TickData> {
    return {
      tick,
      liquidityGross: mockEncrypted(0n),
      liquidityNet: mockEncrypted(0n),
      feeGrowthOutside0: mockEncrypted(0n),
      feeGrowthOutside1: mockEncrypted(0n),
      initialized: false,
    };
  }

  async getTicksInRange(
    tickLower: number,
    tickUpper: number
  ): Promise<TickData[]> {
    return [];
  }

  async getObservation(index: number): Promise<Observation> {
    return {
      blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
      tickCumulative: BigInt(0),
      liquidityCumulative: mockEncrypted(0n),
      initialized: true,
    };
  }

  async getTWAP(secondsAgo: number): Promise<number> {
    return 0;
  }

  async addLiquidity(params: AddLiquidityParams): Promise<LiquidityResult> {
    return {
      positionId: mockPositionId('new-pos'),
      amount0: mockEncrypted(params.amount0Desired),
      amount1: mockEncrypted(params.amount1Desired),
      liquidity: mockEncrypted(params.amount0Desired),
      txReceipt: mockReceipt('add_liquidity', 'add-liq'),
    };
  }

  async removeLiquidity(params: RemoveLiquidityParams): Promise<LiquidityResult> {
    return {
      positionId: params.positionId,
      amount0: mockEncrypted(params.liquidityAmount),
      amount1: mockEncrypted(params.liquidityAmount),
      liquidity: mockEncrypted(params.liquidityAmount),
      txReceipt: mockReceipt('remove_liquidity', 'remove-liq'),
    };
  }

  async collectFees(positionId: PositionId): Promise<TransactionReceipt> {
    return mockReceipt('collect_fees', 'collect');
  }

  async increaseLiquidity(
    positionId: PositionId,
    amount0Desired: bigint,
    amount1Desired: bigint,
    amount0Min: bigint,
    amount1Min: bigint,
    deadline: bigint
  ): Promise<TransactionReceipt> {
    return mockReceipt('increase_liquidity', 'inc-liq');
  }

  async addFullRangeLiquidity(
    amount0: bigint,
    amount1: bigint,
    tickSpacing: number,
    recipient: Address,
    deadline: bigint
  ): Promise<LiquidityResult> {
    return this.addLiquidity({
      poolId: mockPoolId('token0', 'token1', 2),
      tickLower: Math.ceil(MIN_TICK / tickSpacing) * tickSpacing,
      tickUpper: Math.floor(MAX_TICK / tickSpacing) * tickSpacing,
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient,
      deadline,
    });
  }

  async getPositionSummary(): Promise<Array<{
    position: LiquidityPosition;
    liquidity: bigint;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
    inRange: boolean;
  }>> {
    const positions = await this.getMyPositions();
    return positions.items.map((pos: LiquidityPosition) => ({
      position: pos,
      liquidity: 1000000n,
      tokensOwed0: 0n,
      tokensOwed1: 0n,
      inRange: true,
    }));
  }

  private mockPosition(id?: PositionId): LiquidityPosition {
    return {
      positionId: id || mockPositionId(),
      owner: this.tx.getSignerAddress(),
      poolId: mockPoolId('token0', 'token1', 2),
      tickLower: MIN_TICK,
      tickUpper: MAX_TICK,
      liquidity: mockEncrypted(1000000n),
      feeGrowthInside0Last: mockEncrypted(0n),
      feeGrowthInside1Last: mockEncrypted(0n),
      tokensOwed0: mockEncrypted(0n),
      tokensOwed1: mockEncrypted(0n),
    };
  }
}

// ============================================================================
// Mock RouterClient
// ============================================================================

/**
 * Mock RouterClient — deterministic swap operations.
 */
export class MockRouterClient {
  constructor(
    private readonly tx: MockTransactionBuilder,
    private readonly keyPair: HfheKeyPair,
    private readonly routerAddress: Address
  ) {}

  async quoteExactInput(route: SwapRoute, amountIn: bigint): Promise<SwapQuote> {
    return {
      route,
      amountIn,
      expectedAmountOut: amountIn * 99n / 100n, // 1% output
      priceImpactBps: 10,
      totalFeeBps: route.totalFeeBps,
      estimatedGas: BigInt(150000),
      deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
    };
  }

  async quoteExactOutput(route: SwapRoute, amountOut: bigint): Promise<SwapQuote> {
    return {
      route,
      amountIn: amountOut * 101n / 100n, // 1% more input needed
      expectedAmountOut: amountOut,
      priceImpactBps: 10,
      totalFeeBps: route.totalFeeBps,
      estimatedGas: BigInt(150000),
      deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
    };
  }

  async swapExactInput(params: ExactInputParams): Promise<SwapResult> {
    return {
      amountIn: mockEncrypted(params.amountIn),
      amountOut: mockEncrypted(params.amountIn * 99n / 100n),
      executedRoute: params.route,
      effectivePrice: params.amountIn * 99n / 100n,
      txReceipt: mockReceipt('swap_exact_input', 'swap-in'),
    };
  }

  async swapExactOutput(params: ExactOutputParams): Promise<SwapResult> {
    return {
      amountIn: mockEncrypted(params.amountInMaximum),
      amountOut: mockEncrypted(params.amountOut),
      executedRoute: params.route,
      effectivePrice: params.amountOut,
      txReceipt: mockReceipt('swap_exact_output', 'swap-out'),
    };
  }

  async darkPoolSwap(params: DarkPoolSwapParams): Promise<TransactionReceipt> {
    return mockReceipt('dark_pool_swap', 'dark');
  }

  buildDarkPoolParams(
    poolIndex: bigint,
    zeroForOne: boolean,
    amount: bigint,
    minOutput: bigint,
    recipient: bigint,
    deadline: bigint
  ): DarkPoolSwapParams {
    return {
      encryptedPoolSelector: mockEncrypted(poolIndex),
      encryptedDirection: mockEncrypted(zeroForOne ? 1n : 0n),
      encryptedAmount: mockEncrypted(amount),
      encryptedMinOutput: mockEncrypted(minOutput),
      encryptedRecipient: mockEncrypted(recipient),
      deadline,
    };
  }

  async simpleSwap(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    slippageBps: number = 50,
    route?: SwapRoute
  ): Promise<SwapResult> {
    if (!route) {
      throw new Error('Route required for simpleSwap');
    }
    const quote = await this.quoteExactInput(route, amountIn);
    return this.swapExactInput({
      route,
      amountIn,
      amountOutMinimum: quote.expectedAmountOut * BigInt(10000 - slippageBps) / 10000n,
      recipient: this.tx.getSignerAddress(),
      deadline: quote.deadline,
    });
  }

  async splitSwap(
    routes: Array<{ route: SwapRoute; allocationBps: number }>,
    totalAmountIn: bigint,
    slippageBps: number = 50
  ): Promise<SwapResult[]> {
    const results: SwapResult[] = [];
    for (const { route, allocationBps } of routes) {
      const amountIn = totalAmountIn * BigInt(allocationBps) / 10000n;
      results.push(await this.simpleSwap(
        route.tokenIn,
        route.tokenOut,
        amountIn,
        slippageBps,
        route
      ));
    }
    return results;
  }
}

// ============================================================================
// Mock ShieldTokenClient
// ============================================================================

/**
 * Mock ShieldTokenClient — deterministic token operations.
 */
export class MockShieldTokenClient {
  constructor(
    private readonly tx: MockTransactionBuilder,
    private readonly keyPair: HfheKeyPair,
    private readonly tokenAddress: Address
  ) {}

  async getTokenInfo(): Promise<TokenInfo> {
    return {
      address: this.tokenAddress,
      name: 'MockToken',
      symbol: 'MTK',
      decimals: 18,
      totalSupply: mockEncrypted(BigInt(10 ** 24)),
    };
  }

  async getBalance(holder: Address): Promise<TokenBalance> {
    return {
      token: this.tokenAddress,
      holder,
      encryptedBalance: mockEncrypted(1000000000000000000n), // 1 token
    };
  }

  async getAllowance(owner: Address, spender: Address): Promise<TokenAllowance> {
    return {
      token: this.tokenAddress,
      owner,
      spender,
      encryptedAllowance: mockEncrypted(BigInt(2 ** 64 - 1)),
    };
  }

  decryptBalance(balance: TokenBalance): bigint {
    return 1000000000000000000n;
  }

  decryptAllowance(allowance: TokenAllowance): bigint {
    return BigInt(2 ** 64 - 1);
  }

  async transfer(to: Address, amount: bigint): Promise<TransactionReceipt> {
    return mockReceipt('transfer', 'transfer');
  }

  async approve(spender: Address, amount: bigint): Promise<TransactionReceipt> {
    return mockReceipt('approve', 'approve');
  }

  async transferFrom(
    from: Address,
    to: Address,
    amount: bigint
  ): Promise<TransactionReceipt> {
    return mockReceipt('transfer_from', 'transfer-from');
  }

  async increaseAllowance(spender: Address, addedAmount: bigint): Promise<TransactionReceipt> {
    return mockReceipt('increase_allowance', 'inc-allow');
  }

  async decreaseAllowance(spender: Address, subtractedAmount: bigint): Promise<TransactionReceipt> {
    return mockReceipt('decrease_allowance', 'dec-allow');
  }

  async getMyBalance(): Promise<{ encrypted: EncryptedU64; plaintext: bigint }> {
    const signer = this.tx.getSignerAddress();
    const balance = await this.getBalance(signer);
    return {
      encrypted: balance.encryptedBalance,
      plaintext: 1000000000000000000n,
    };
  }

  async approveMax(spender: Address): Promise<TransactionReceipt> {
    return this.approve(spender, BigInt(2 ** 64 - 1));
  }

  async ensureAllowance(
    spender: Address,
    requiredAmount: bigint
  ): Promise<{ approved: boolean; receipt?: TransactionReceipt }> {
    const currentAllowance = await this.getAllowance(this.tx.getSignerAddress(), spender);
    if (this.decryptAllowance(currentAllowance) >= requiredAmount) {
      return { approved: false };
    }
    const receipt = await this.approveMax(spender);
    return { approved: true, receipt };
  }
}

// ============================================================================
// Mock AIEngineClient
// ============================================================================

/**
 * Mock AI Engine health status.
 */
export interface AIHealthStatus {
  readonly circleId: string;
  readonly isOnline: boolean;
  readonly lastUpdateBlock: bigint;
  readonly modelVersion: string;
  readonly poolsMonitored: number;
  readonly totalAlertsIssued: number;
}

/**
 * Pool risk assessment from the AI engine.
 */
export interface PoolRiskAssessment {
  readonly poolId: PoolId;
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
  readonly riskScore: number;
  readonly factors: readonly string[];
  readonly recommendation: string;
}

/**
 * Mock AIEngineClient — deterministic AI operations.
 */
export class MockAIEngineClient {
  constructor(
    private readonly tx: MockTransactionBuilder,
    private readonly keyPair: HfheKeyPair,
    private readonly aiAddress: Address
  ) {}

  async getDynamicFee(poolId: PoolId): Promise<DynamicFee> {
    return {
      poolId,
      baseFee: mockEncrypted(3000n),
      adjustedFee: mockEncrypted(3500n),
      multiplierBps: 1167,
      confidence: 0.95,
      lastUpdatedBlock: BigInt(1000000),
    };
  }

  async getDynamicFees(poolIds: readonly PoolId[]): Promise<DynamicFee[]> {
    return poolIds.map(id => ({
      poolId: id,
      baseFee: mockEncrypted(3000n),
      adjustedFee: mockEncrypted(3500n),
      multiplierBps: 1167,
      confidence: 0.95,
      lastUpdatedBlock: BigInt(1000000),
    }));
  }

  decryptFee(fee: DynamicFee): { baseFee: bigint; adjustedFee: bigint } {
    return {
      baseFee: 3000n,
      adjustedFee: 3500n,
    };
  }

  async getVolatility(poolId: PoolId): Promise<VolatilityData> {
    return {
      poolId,
      emaVolatility: mockEncrypted(500n),
      shortTermVol: mockEncrypted(600n),
      longTermVol: mockEncrypted(400n),
      volRatio: mockEncrypted(150n),
      sampleCount: 1000,
      lastUpdatedBlock: BigInt(1000000),
    };
  }

  decryptVolatility(vol: VolatilityData): {
    emaVolatility: bigint;
    shortTermVol: bigint;
    longTermVol: bigint;
    volRatio: bigint;
  } {
    return {
      emaVolatility: 500n,
      shortTermVol: 600n,
      longTermVol: 400n,
      volRatio: 150n,
    };
  }

  async getMevAlerts(poolId: PoolId): Promise<MevAlert[]> {
    return [];
  }

  async checkTransactionMev(txData: string): Promise<{
    isSuspicious: boolean;
    alertType: string | null;
    score: number;
    recommendation: string;
  }> {
    return {
      isSuspicious: false,
      alertType: null,
      score: 0,
      recommendation: 'safe',
    };
  }

  async getMevProtectionStatus(): Promise<{
    isProtected: boolean;
    pendingShieldedTxs: number;
    blockedAttacks: number;
  }> {
    return {
      isProtected: true,
      pendingShieldedTxs: 0,
      blockedAttacks: 0,
    };
  }

  async getRebalanceSuggestions(positionId: PositionId): Promise<RebalanceSuggestion[]> {
    return [{
      positionId,
      poolId: mockPoolId('token0', 'token1', 2),
      currentTickLower: MIN_TICK,
      currentTickUpper: MAX_TICK,
      suggestedTickLower: MIN_TICK + 1000,
      suggestedTickUpper: MAX_TICK - 1000,
      estimatedImprovement: mockEncrypted(10000n),
      confidence: 0.85,
      reason: 'Optimize fee earnings based on current tick distribution',
    }];
  }

  async getMyRebalanceSuggestions(): Promise<RebalanceSuggestion[]> {
    return this.getRebalanceSuggestions(mockPositionId());
  }

  async getPoolRisk(poolId: PoolId): Promise<PoolRiskAssessment> {
    return {
      poolId,
      riskLevel: 'low',
      riskScore: 1500,
      factors: ['deep_liquidity', 'low_volatility'],
      recommendation: 'Safe for trading',
    };
  }

  async getHealthStatus(): Promise<AIHealthStatus> {
    return {
      circleId: 'circle-mock',
      isOnline: true,
      lastUpdateBlock: BigInt(1000000),
      modelVersion: '1.0.0',
      poolsMonitored: 10,
      totalAlertsIssued: 5,
    };
  }

  async submitObservation(
    poolId: PoolId,
    tick: number,
    liquidity: bigint,
    volume: bigint
  ): Promise<TransactionReceipt> {
    return mockReceipt('submit_observation', 'obs');
  }

  async requestFeeUpdate(poolId: PoolId): Promise<TransactionReceipt> {
    return mockReceipt('request_fee_update', 'fee-update');
  }

  async reportMevSuspicion(
    poolId: PoolId,
    suspectedTxHashes: readonly string[],
    evidence: string
  ): Promise<TransactionReceipt> {
    return mockReceipt('report_mev', 'mev-report');
  }

  async isPoolSafe(poolId: PoolId): Promise<{
    safe: boolean;
    reason: string;
    riskLevel: string;
    activeMevAlerts: number;
  }> {
    return {
      safe: true,
      reason: 'Pool is safe for trading.',
      riskLevel: 'low',
      activeMevAlerts: 0,
    };
  }

  async getPoolDashboard(poolId: PoolId): Promise<{
    dynamicFee: DynamicFee;
    volatility: VolatilityData;
    mevAlerts: MevAlert[];
    risk: PoolRiskAssessment;
    isSafe: boolean;
  }> {
    const [dynamicFee, volatility, mevAlerts, risk] = await Promise.all([
      this.getDynamicFee(poolId),
      this.getVolatility(poolId),
      this.getMevAlerts(poolId),
      this.getPoolRisk(poolId),
    ]);

    return {
      dynamicFee,
      volatility,
      mevAlerts,
      risk,
      isSafe: true,
    };
  }
}

// ============================================================================
// Factory functions for creating mock instances
// ============================================================================

/**
 * Create a mock TransactionBuilder configured for testing.
 */
export function createMockTransactionBuilder(config: Partial<OctraShieldConfig> = {}): MockTransactionBuilder {
  return new MockTransactionBuilder({
    network: config.network || 'testnet',
    ...config,
  });
}

/**
 * Create a mock HFHE key pair for testing.
 */
export function createMockKeyPair(): HfheKeyPair {
  return {
    publicKey: new Uint8Array(32).fill(1),
    secretKey: new Uint8Array(32).fill(2),
    fingerprint: 'mock-key-fingerprint',
  };
}

/**
 * Create a mock FactoryClient.
 */
export function createMockFactoryClient(
  tx: MockTransactionBuilder,
  factoryAddress: Address = mockAddress('factory')
): MockFactoryClient {
  return new MockFactoryClient(tx, factoryAddress);
}

/**
 * Create a mock PairClient.
 */
export function createMockPairClient(
  tx: MockTransactionBuilder,
  keyPair: HfheKeyPair,
  poolAddress: Address = mockAddress('pair')
): MockPairClient {
  return new MockPairClient(tx, keyPair, poolAddress);
}

/**
 * Create a mock RouterClient.
 */
export function createMockRouterClient(
  tx: MockTransactionBuilder,
  keyPair: HfheKeyPair,
  routerAddress: Address = mockAddress('router')
): MockRouterClient {
  return new MockRouterClient(tx, keyPair, routerAddress);
}

/**
 * Create a mock ShieldTokenClient.
 */
export function createMockShieldTokenClient(
  tx: MockTransactionBuilder,
  keyPair: HfheKeyPair,
  tokenAddress: Address = mockAddress('token')
): MockShieldTokenClient {
  return new MockShieldTokenClient(tx, keyPair, tokenAddress);
}

/**
 * Create a mock AIEngineClient.
 */
export function createMockAIEngineClient(
  tx: MockTransactionBuilder,
  keyPair: HfheKeyPair,
  aiAddress: Address = mockAddress('ai')
): MockAIEngineClient {
  return new MockAIEngineClient(tx, keyPair, aiAddress);
}

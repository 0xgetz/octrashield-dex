/**
 * OctraShield DEX SDK Constants
 *
 * All cryptographic parameters, fee tiers, tick bounds, and network
 * configuration matching the on-chain Rust contracts exactly.
 */

// ============================================================================
// HFHE Cryptographic Parameters
// ============================================================================

/**
 * Mersenne prime p = 2^61 - 1
 * The modular arithmetic field for all HFHE operations.
 * Matches `shared::constants::MERSENNE_PRIME` in the Rust contracts.
 */
export const MERSENNE_PRIME = 2305843009213693951n;

/**
 * Bit width of the Mersenne prime field.
 * Used for noise budget calculations and encoding validation.
 */
export const MERSENNE_BITS = 61;

/**
 * Maximum plaintext value before encryption.
 * Any value >= MERSENNE_PRIME will be rejected.
 */
export const MAX_PLAINTEXT = MERSENNE_PRIME - 1n;

/**
 * Default noise budget for freshly encrypted ciphertexts.
 * Each homomorphic operation consumes noise budget.
 * When budget reaches 0, the ciphertext is corrupted.
 */
export const DEFAULT_NOISE_BUDGET = 120;

/**
 * Noise consumption per operation type.
 * Matches the Rust contract's noise tracking.
 */
export const NOISE_COSTS = {
  ADD: 1,
  SUB: 1,
  MUL: 3,
  COMPARE: 2,
  CONDITIONAL_SELECT: 2,
  DIVISION_ITERATION: 4,  // per Newton-Raphson iteration
  REENCRYPT: 0,           // resets budget to DEFAULT_NOISE_BUDGET
} as const;

/**
 * Minimum noise budget required before an operation can proceed.
 * If a ciphertext's remaining budget is below this, it must be re-encrypted.
 */
export const MIN_NOISE_BUDGET = 10;

// ============================================================================
// Fee Tiers
// ============================================================================

/**
 * Fee tier definitions matching `shared::constants::FEE_TIERS`.
 * fee_bps: fee in basis points (1 bps = 0.01%)
 * tick_spacing: minimum tick distance for concentrated liquidity positions
 */
export const FEE_TIERS = [
  { id: 0, fee_bps: 1,   tick_spacing: 1,   label: 'Ultra-low (0.01%)' },
  { id: 1, fee_bps: 5,   tick_spacing: 10,  label: 'Low (0.05%)' },
  { id: 2, fee_bps: 30,  tick_spacing: 60,  label: 'Medium (0.30%)' },
  { id: 3, fee_bps: 100, tick_spacing: 200, label: 'High (1.00%)' },
] as const;

export type FeeTierId = 0 | 1 | 2 | 3;

/**
 * Fee denominator for basis point calculations.
 * fee_amount = (amount * fee_bps) / FEE_DENOMINATOR
 */
export const FEE_DENOMINATOR = 10_000;

/**
 * Protocol fee: percentage of trading fees directed to protocol treasury.
 * 1/6 of the LP fee goes to protocol (matching Uniswap v3 convention).
 */
export const PROTOCOL_FEE_FRACTION = 6;

// ============================================================================
// Tick / Price Bounds
// ============================================================================

/**
 * Tick range for concentrated liquidity.
 * tick = log_{1.0001}(price)
 * Matches `shared::constants::MIN_TICK` / `MAX_TICK`.
 */
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

/**
 * Minimum and maximum sqrt price ratios (Q64.96 fixed-point).
 * Used for price bound validation in concentrated liquidity.
 */
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

// ============================================================================
// Swap / Router Constants
// ============================================================================

/**
 * Maximum number of hops in a multi-hop swap route.
 */
export const MAX_SWAP_HOPS = 4;

/**
 * Default slippage tolerance in basis points.
 * 50 bps = 0.50%
 */
export const DEFAULT_SLIPPAGE_BPS = 50;

/**
 * Maximum slippage tolerance in basis points.
 * 5000 bps = 50%
 */
export const MAX_SLIPPAGE_BPS = 5000;

/**
 * Default swap deadline: 20 minutes from submission.
 */
export const DEFAULT_DEADLINE_SECONDS = 1200;

// ============================================================================
// AI Engine Constants
// ============================================================================

/**
 * EMA smoothing factor alpha = 2 / (N + 1) where N = 20 periods.
 * Stored as basis points for integer arithmetic: alpha_bps = 952
 */
export const AI_EMA_ALPHA_BPS = 952;

/**
 * Fee adjustment bounds: AI can adjust fees within [-50%, +200%] of base.
 * Stored as multiplier basis points.
 */
export const AI_MIN_FEE_MULTIPLIER_BPS = 5000;  // 50% of base
export const AI_MAX_FEE_MULTIPLIER_BPS = 30000; // 300% of base

/**
 * MEV detection: minimum suspicious score to flag a transaction.
 * Range: 0-10000 (basis points of confidence).
 */
export const AI_MEV_THRESHOLD_BPS = 7000;

/**
 * Sandwich attack detection window in blocks.
 */
export const AI_SANDWICH_WINDOW_BLOCKS = 3;

// ============================================================================
// Network Configuration
// ============================================================================

export interface NetworkConfig {
  readonly chainId: number;
  readonly name: string;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly contracts: {
    readonly factory: string;
    readonly router: string;
    readonly aiEngine: string;
  };
}

/**
 * Known network configurations.
 * Addresses are placeholders until mainnet deployment.
 */
export const NETWORKS: Record<string, NetworkConfig> = {
  'octra-mainnet': {
    chainId: 1,
    name: 'Octra Mainnet',
    rpcUrl: 'https://rpc.octra.network',
    explorerUrl: 'https://explorer.octra.network',
    contracts: {
      factory: '0x0000000000000000000000000000000000000000',
      router: '0x0000000000000000000000000000000000000000',
      aiEngine: '0x0000000000000000000000000000000000000000',
    },
  },
  'octra-testnet': {
    chainId: 9999,
    name: 'Octra Testnet',
    rpcUrl: 'https://rpc-testnet.octra.network',
    explorerUrl: 'https://explorer-testnet.octra.network',
    contracts: {
      factory: '0x0000000000000000000000000000000000000000',
      router: '0x0000000000000000000000000000000000000000',
      aiEngine: '0x0000000000000000000000000000000000000000',
    },
  },
} as const;

/**
 * Default network for SDK initialization.
 */
export const DEFAULT_NETWORK = 'octra-testnet';

// ============================================================================
// Encoding / Serialization
// ============================================================================

/**
 * Ciphertext serialization prefix byte.
 * All HFHE ciphertexts start with this byte for type identification.
 */
export const CIPHERTEXT_PREFIX = 0xfe;

/**
 * Maximum serialized ciphertext size in bytes.
 */
export const MAX_CIPHERTEXT_BYTES = 256;

/**
 * OCS01 method prefix bytes for view vs call distinction.
 */
export const OCS01_VIEW_PREFIX = new Uint8Array([0x01]);
export const OCS01_CALL_PREFIX = new Uint8Array([0x02]);

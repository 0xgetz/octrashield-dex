# OctraShield DEX SDK — API Surface Analysis for Mock Implementation

## Overview

The OctraShield DEX SDK is a comprehensive TypeScript library for interacting with a privacy-preserving decentralized exchange. It consists of:

1. **HFHE (Hybrid Fully Homomorphic Encryption)** — Client-side encryption/decryption
2. **OCS01 Transaction Builder** — Ed25519 signing and transaction submission
3. **Contract Clients** — 5 clients for DEX contracts
4. **Types, Constants, and Errors** — Shared definitions
5. **Utilities** — Encoding, math, and routing helpers

---

## 1. HFHE Encryption API (`hfhe.ts`)

### Key Types

```typescript
interface HfheKeyPair {
  publicKey: Uint8Array;    // 32 bytes, derived from secret key
  secretKey: Uint8Array;    // 32 bytes, client-only
  fingerprint: string;      // 16-char hex identifier
}

interface EncryptedU64 {
  ciphertext: CiphertextHex;  // Hex-encoded ciphertext
  noiseBudget: number;         // 0-120, tracks remaining operations
  isZeroProof?: boolean;       // Optional ZK proof flag
}

interface DecryptedValue {
  value: bigint;
  decryptionProof: Uint8Array;
  originalCiphertext: CiphertextHex;
}
```

### Exported Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `generateKeyPair` | `() => HfheKeyPair` | Generate new HFHE key pair |
| `encrypt` | `(value: bigint, keyPair: HfheKeyPair) => EncryptedU64` | Encrypt plaintext value |
| `encryptNumber` | `(value: number, keyPair: HfheKeyPair) => EncryptedU64` | Encrypt JS number |
| `encryptZero` | `(keyPair: HfheKeyPair) => EncryptedU64` | Encrypt zero with ZK proof |
| `decrypt` | `(encrypted: EncryptedU64, keyPair: HfheKeyPair) => DecryptedValue` | Decrypt to plaintext |
| `decryptValue` | `(encrypted: EncryptedU64, keyPair: HfheKeyPair) => bigint` | Decrypt, return bigint |
| `decryptNumber` | `(encrypted: EncryptedU64, keyPair: HfheKeyPair) => number` | Decrypt, return number |
| `encryptBatch` | `(values: bigint[], keyPair: HfheKeyPair) => EncryptedU64[]` | Batch encrypt |
| `decryptBatch` | `(encryptedValues: EncryptedU64[], keyPair: HfheKeyPair) => DecryptedValue[]` | Batch decrypt |
| `simulateAdd` | `(a: EncryptedU64, b: EncryptedU64) => EncryptedU64` | Client-side add simulation |
| `simulateSub` | `(a: EncryptedU64, b: EncryptedU64) => EncryptedU64` | Client-side sub simulation |
| `simulateMul` | `(a: EncryptedU64, b: EncryptedU64) => EncryptedU64` | Client-side mul simulation |
| `hasNoiseBudget` | `(encrypted: EncryptedU64, operation: keyof typeof NOISE_COSTS) => boolean` | Check budget |
| `estimateRemainingOps` | `(encrypted: EncryptedU64, operation: keyof typeof NOISE_COSTS) => number` | Estimate ops left |
| `reencrypt` | `(encrypted: EncryptedU64, keyPair: HfheKeyPair) => EncryptedU64` | Refresh noise budget |
| `isValidCiphertext` | `(hex: string) => hex is CiphertextHex` | Validate ciphertext format |
| `isValidPlaintext` | `(value: bigint) => boolean` | Validate plaintext range |
| `fieldAdd` | `(a: bigint, b: bigint) => bigint` | Mersenne field addition |
| `fieldSub` | `(a: bigint, b: bigint) => bigint` | Mersenne field subtraction |
| `fieldMul` | `(a: bigint, b: bigint) => bigint` | Mersenne field multiplication |
| `fieldPow` | `(base: bigint, exp: bigint) => bigint` | Mersenne field exponentiation |
| `fieldInverse` | `(a: bigint) => bigint` | Mersenne field inverse |
| `bytesToHex` | `(bytes: Uint8Array) => string` | Convert bytes to hex |

### Key Constants Used

- `MERSENNE_PRIME = 170141183460469231731687303715884105727n` (2^127 - 1)
- `DEFAULT_NOISE_BUDGET = 120`
- `NOISE_COSTS = { ADD: 1, SUB: 1, MUL: 3, COMPARE: 2, ... }`
- `CIPHERTEXT_PREFIX = 0xFE`

### Mock Implementation Strategy

For testing, the mock HFHE should:
- Use simple XOR or addition-based encryption instead of Mersenne prime arithmetic
- Skip actual cryptographic operations (SHA-512, random generation)
- Maintain the same interface signatures
- Return deterministic "encrypted" values for reproducible tests
- Track noise budget the same way

---

## 2. OCS01 Transaction API (`ocs01.ts`)

### Key Types

```typescript
interface OCS01ViewCall {
  type: 'view';
  contract: Address;
  method: string;
  args: unknown[];
}

interface OCS01CallTransaction {
  type: 'call';
  contract: Address;
  method: string;
  args: unknown[];
  signature: Uint8Array;
  signer: Address;
  nonce: bigint;
  deadline: bigint;
}

interface TransactionReceipt {
  txHash: TxHash;
  blockNumber: bigint;
  blockTimestamp: bigint;
  gasUsed: bigint;
  status: 'success' | 'reverted';
  events: ContractEvent[];
  revertReason?: string;
}

interface ContractEvent {
  contract: Address;
  name: string;
  data: Record<string, unknown>;
  blockNumber: bigint;
  txHash: TxHash;
  logIndex: number;
}
```

### Exported Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `encodeViewCall` | `(call: OCS01ViewCall) => Uint8Array` | Encode view call to wire format |
| `encodeCallTransaction` | `(tx: Omit<OCS01CallTransaction, 'signature' | 'type'>) => Uint8Array` | Encode call tx |
| `signPayload` | `(payload: Uint8Array, signingKey: Uint8Array) => Promise<Uint8Array>` | Ed25519 sign |
| `verifySignature` | `(sig: Uint8Array, payload: Uint8Array, publicKey: Uint8Array) => Promise<boolean>` | Verify signature |
| `derivePublicKey` | `(signingKey: Uint8Array) => Promise<Uint8Array>` | Derive Ed25519 public key |

### TransactionBuilder Class

```typescript
class TransactionBuilder {
  constructor(config: OctraShieldConfig, signingKey?: Uint8Array)
  
  async initialize(): Promise<void>
  getSignerAddress(): Address
  
  // View calls (read-only)
  async viewCall<T>(contract: Address, method: string, args?: unknown[]): Promise<T>
  
  // Call transactions (signed, state-mutating)
  async callTransaction(
    contract: Address,
    method: string,
    args?: unknown[],
    deadlineSeconds?: number
  ): Promise<TransactionReceipt>
  
  async estimateGas(contract: Address, method: string, args?: unknown[]): Promise<bigint>
  async waitForReceipt(txHash: TxHash, timeoutMs?: number): Promise<TransactionReceipt>
}
```

### Mock Implementation Strategy

For testing, the mock TransactionBuilder should:
- Skip actual RPC calls
- Return mock/simulated responses for view calls
- Return mock transaction receipts for call transactions
- Not require actual network connectivity
- Support injecting custom mock responses for specific methods

---

## 3. Contract Clients

### ShieldTokenClient

```typescript
class ShieldTokenClient {
  constructor(tx: TransactionBuilder, keyPair: HfheKeyPair, tokenAddress: Address)
  
  // View methods
  async getTokenInfo(): Promise<TokenInfo>
  async getBalance(holder: Address): Promise<TokenBalance>
  async getAllowance(owner: Address, spender: Address): Promise<TokenAllowance>
  
  // Decryption helpers
  decryptBalance(balance: TokenBalance): bigint
  decryptAllowance(allowance: TokenAllowance): bigint
  
  // Call methods
  async transfer(to: Address, amount: bigint): Promise<TransactionReceipt>
  async approve(spender: Address, amount: bigint): Promise<TransactionReceipt>
  async transferFrom(from: Address, to: Address, amount: bigint): Promise<TransactionReceipt>
  async increaseAllowance(spender: Address, addedAmount: bigint): Promise<TransactionReceipt>
  async decreaseAllowance(spender: Address, subtractedAmount: bigint): Promise<TransactionReceipt>
  
  // Convenience
  async getMyBalance(): Promise<{ encrypted: EncryptedU64; plaintext: bigint }>
  async approveMax(spender: Address): Promise<TransactionReceipt>
  async ensureAllowance(spender: Address, requiredAmount: bigint): Promise<{ approved: boolean; receipt?: TransactionReceipt }>
}
```

### FactoryClient

```typescript
class FactoryClient {
  constructor(tx: TransactionBuilder, factoryAddress: Address)
  
  // View methods
  async getPool(tokenA: Address, tokenB: Address, feeTier: FeeTierId): Promise<PoolInfo | null>
  async getAllPools(offset?: number, limit?: number): Promise<Paginated<PoolInfo>>
  async getPoolsForToken(token: Address): Promise<PoolInfo[]>
  async getPoolCount(): Promise<number>
  async getFeeTiers(): Promise<typeof FEE_TIERS>
  async getOwner(): Promise<Address>
  async poolExists(tokenA: Address, tokenB: Address, feeTier: FeeTierId): Promise<boolean>
  
  // Call methods
  async createPool(params: CreatePoolParams): Promise<TransactionReceipt>
  async enableFeeTier(feeBps: number, tickSpacing: number): Promise<TransactionReceipt>
  async transferOwnership(newOwner: Address): Promise<TransactionReceipt>
  
  // Convenience
  async getOrCreatePool(params: CreatePoolParams): Promise<{ pool: PoolInfo; created: boolean; receipt?: TransactionReceipt }>
  async findBestFeeTier(tokenA: Address, tokenB: Address): Promise<FeeTierId | null>
}
```

### PairClient

```typescript
class PairClient {
  constructor(tx: TransactionBuilder, keyPair: HfheKeyPair, poolAddress: Address)
  
  // View: Pool State
  async getPoolState(): Promise<PoolState>
  async getCurrentTick(): Promise<number>
  async getReserves(): Promise<{ reserve0: EncryptedU64; reserve1: EncryptedU64 }>
  decryptReserves(reserves: { reserve0: EncryptedU64; reserve1: EncryptedU64 }): { reserve0: bigint; reserve1: bigint }
  async getLiquidity(): Promise<EncryptedU64>
  
  // View: Positions
  async getPosition(positionId: PositionId): Promise<LiquidityPosition>
  async getPositions(owner: Address, offset?: number, limit?: number): Promise<Paginated<LiquidityPosition>>
  async getMyPositions(): Promise<Paginated<LiquidityPosition>>
  decryptPosition(position: LiquidityPosition): { liquidity: bigint; tokensOwed0: bigint; tokensOwed1: bigint }
  
  // View: Ticks & Observations
  async getTickData(tick: number): Promise<TickData>
  async getTicksInRange(tickLower: number, tickUpper: number): Promise<TickData[]>
  async getObservation(index: number): Promise<Observation>
  async getTWAP(secondsAgo: number): Promise<number>
  
  // Call: Liquidity
  async addLiquidity(params: AddLiquidityParams): Promise<LiquidityResult>
  async removeLiquidity(params: RemoveLiquidityParams): Promise<LiquidityResult>
  async collectFees(positionId: PositionId): Promise<TransactionReceipt>
  async increaseLiquidity(positionId: PositionId, amount0Desired: bigint, amount1Desired: bigint, amount0Min: bigint, amount1Min: bigint, deadline: bigint): Promise<TransactionReceipt>
  
  // Convenience
  async addFullRangeLiquidity(amount0: bigint, amount1: bigint, tickSpacing: number, recipient: Address, deadline: bigint): Promise<LiquidityResult>
  async getPositionSummary(): Promise<Array<{ position: LiquidityPosition; liquidity: bigint; tokensOwed0: bigint; tokensOwed1: bigint; inRange: boolean }>>
}
```

### RouterClient

```typescript
class RouterClient {
  constructor(tx: TransactionBuilder, keyPair: HfheKeyPair, routerAddress: Address)
  
  // Quoting
  async quoteExactInput(route: SwapRoute, amountIn: bigint): Promise<SwapQuote>
  async quoteExactOutput(route: SwapRoute, amountOut: bigint): Promise<SwapQuote>
  
  // Swap Execution
  async swapExactInput(params: ExactInputParams): Promise<SwapResult>
  async swapExactOutput(params: ExactOutputParams): Promise<SwapResult>
  
  // Dark Pool
  async darkPoolSwap(params: DarkPoolSwapParams): Promise<TransactionReceipt>
  buildDarkPoolParams(poolIndex: bigint, zeroForOne: boolean, amount: bigint, minOutput: bigint, recipient: bigint, deadline: bigint): DarkPoolSwapParams
  
  // Convenience
  async simpleSwap(tokenIn: Address, tokenOut: Address, amountIn: bigint, slippageBps?: number, route?: SwapRoute): Promise<SwapResult>
  async splitSwap(routes: Array<{ route: SwapRoute; allocationBps: number }>, totalAmountIn: bigint, slippageBps?: number): Promise<SwapResult[]>
}
```

### AIEngineClient

```typescript
class AIEngineClient {
  constructor(tx: TransactionBuilder, aiEngineAddress: Address)
  
  // View methods
  async getHealth(): Promise<AIHealthStatus>
  async getDynamicFee(poolId: PoolId): Promise<DynamicFee>
  async getVolatility(poolId: PoolId): Promise<VolatilityData>
  async checkMEV(poolId: PoolId): Promise<MevAlert | null>
  async getRebalanceSuggestions(positionId: PositionId): Promise<RebalanceSuggestion[]>
  async assessPoolRisk(poolId: PoolId): Promise<PoolRiskAssessment>
}
```

---

## 4. Types (`types.ts`)

### Branded Types

```typescript
type Address = Brand<string, 'Address'>;           // 32-byte hex
type TxHash = Brand<string, 'TxHash'>;             // 32-byte hex
type CiphertextHex = Brand<string, 'CiphertextHex'>; // HFHE ciphertext
type PoolId = Brand<string, 'PoolId'>;             // Pool identifier
type PositionId = Brand<string, 'PositionId'>;     // NFT position ID
```

### Key Interfaces

- **HFHE Types**: `EncryptedU64`, `DecryptedValue`, `HfheKeyPair`
- **Transaction Types**: `OCS01ViewCall`, `OCS01CallTransaction`, `OCS01Transaction`, `TransactionReceipt`, `ContractEvent`
- **Token Types**: `TokenInfo`, `TokenBalance`, `TokenAllowance`
- **Factory Types**: `CreatePoolParams`, `PoolInfo`
- **Pair Types**: `PoolState`, `LiquidityPosition`, `AddLiquidityParams`, `RemoveLiquidityParams`, `LiquidityResult`, `TickData`, `Observation`
- **Router Types**: `SwapHop`, `SwapRoute`, `ExactInputParams`, `ExactOutputParams`, `DarkPoolSwapParams`, `SwapResult`, `SwapQuote`
- **AI Types**: `DynamicFee`, `VolatilityData`, `MevAlert`, `RebalanceSuggestion`
- **Config Types**: `OctraShieldConfig`, `WalletState`, `ConnectionStatus`
- **Utility Types**: `Paginated<T>`, `Result<T, E>`, `Subscription`, `OctraShieldError`

---

## 5. Constants (`constants.ts`)

### Cryptographic

```typescript
export const MERSENNE_PRIME = 170141183460469231731687303715884105727n; // 2^127 - 1
export const MERSENNE_BITS = 127;
export const MAX_PLAINTEXT = MERSENNE_PRIME - 1n;
export const DEFAULT_NOISE_BUDGET = 120;
export const NOISE_COSTS = { ADD: 1, SUB: 1, MUL: 3, COMPARE: 2, ... };
export const MIN_NOISE_BUDGET = 10;
export const CIPHERTEXT_PREFIX = 0xFE;
export const MAX_CIPHERTEXT_BYTES = 256;
```

### Fee Tiers

```typescript
export const FEE_TIERS = [
  { id: 0, fee_bps: 1,   tick_spacing: 1,   label: 'Ultra-low (0.01%)' },
  { id: 1, fee_bps: 5,   tick_spacing: 10,  label: 'Low (0.05%)' },
  { id: 2, fee_bps: 30,  tick_spacing: 60,  label: 'Medium (0.30%)' },
  { id: 3, fee_bps: 100, tick_spacing: 200, label: 'High (1.00%)' },
];
export type FeeTierId = 0 | 1 | 2 | 3;
export const FEE_DENOMINATOR = 10_000;
export const PROTOCOL_FEE_FRACTION = 6;
```

### Tick Bounds

```typescript
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
```

### Swap/Router

```typescript
export const MAX_SWAP_HOPS = 4;
export const DEFAULT_SLIPPAGE_BPS = 50;  // 0.50%
export const MAX_SLIPPAGE_BPS = 5000;    // 50%
export const DEFAULT_DEADLINE_SECONDS = 1200; // 20 minutes
```

### AI Engine

```typescript
export const AI_EMA_ALPHA_BPS = 952;
export const AI_MIN_FEE_MULTIPLIER_BPS = 5000;   // 50%
export const AI_MAX_FEE_MULTIPLIER_BPS = 30000;  // 300%
export const AI_MEV_THRESHOLD_BPS = 7000;
export const AI_SANDWICH_WINDOW_BLOCKS = 3;
```

### Network Configuration

```typescript
export interface NetworkConfig {
  chainId: string | number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl?: string;
  contracts: { factory: string; router: string; aiEngine: string };
}

export const NETWORKS: Record<string, NetworkConfig> = {
  'octra-mainnet': { ... },
  'octra-testnet': { ... },
};
export const DEFAULT_NETWORK = 'octra-testnet';
```

### OCS01 Prefixes

```typescript
export const OCS01_VIEW_PREFIX = new Uint8Array([0x01]);
export const OCS01_CALL_PREFIX = new Uint8Array([0x02]);
```

---

## 6. Error Classes (`errors.ts`)

### Base Class

```typescript
class OctraShieldError extends Error {
  code: string;
  details?: Record<string, unknown>;
}
```

### HFHE Errors

- `EncryptionError` (code: 'ENCRYPTION_ERROR')
- `DecryptionError` (code: 'DECRYPTION_ERROR')
- `NoiseBudgetExhausted` (code: 'NOISE_BUDGET_EXHAUSTED')
- `InvalidPlaintext` (code: 'INVALID_PLAINTEXT')
- `InvalidCiphertext` (code: 'INVALID_CIPHERTEXT')

### Transaction Errors

- `TransactionError` (code: 'TRANSACTION_ERROR')
- `SignatureError` (code: 'SIGNATURE_ERROR')
- `NonceError` (code: 'NONCE_ERROR')
- `DeadlineExpired` (code: 'DEADLINE_EXPIRED')

### Pool/AMM Errors

- `PoolNotFound` (code: 'POOL_NOT_FOUND')
- `PoolAlreadyExists` (code: 'POOL_ALREADY_EXISTS')
- `InsufficientLiquidity` (code: 'INSUFFICIENT_LIQUIDITY')
- `InvalidTickRange` (code: 'INVALID_TICK_RANGE')
- `KInvariantViolation` (code: 'K_INVARIANT_VIOLATION')

### Swap/Router Errors

- `SlippageExceeded` (code: 'SLIPPAGE_EXCEEDED')
- `RouteNotFound` (code: 'ROUTE_NOT_FOUND')
- `MaxHopsExceeded` (code: 'MAX_HOPS_EXCEEDED')
- `InsufficientBalance` (code: 'INSUFFICIENT_BALANCE')
- `InsufficientAllowance` (code: 'INSUFFICIENT_ALLOWANCE')

### AI Engine Errors

- `MevDetected` (code: 'MEV_DETECTED')
- `AICircleUnavailable` (code: 'AI_CIRCLE_UNAVAILABLE')

### Connection Errors

- `ConnectionError` (code: 'CONNECTION_ERROR')
- `WalletNotConnected` (code: 'WALLET_NOT_CONNECTED')
- `NetworkMismatch` (code: 'NETWORK_MISMATCH')
- `RpcError` (code: 'RPC_ERROR')

### Helper Functions

```typescript
function isOctraShieldError(error: unknown): error is OctraShieldError
function wrapError(error: unknown): OctraShieldError
```

---

## 7. Utilities

### Encoding (`encoding.ts`)

- `toHex`, `fromHex`, `toHexPrefixed`, `stripHexPrefix`
- `toBase64`, `fromBase64`
- `isValidAddress`, `toAddress`, `ZERO_ADDRESS`, `isZeroAddress`, `truncateAddress`
- `computePoolId`, `sortTokens`
- `bigintToBytes`, `bytesToBigint`, `bigintToString`, `stringToBigint`
- `formatAmount`, `parseAmount`
- `concatBytes`

### Math (`math.ts`)

- `tickToPrice`, `priceToTick`
- `tickToSqrtPriceX96`, `sqrtPriceX96ToTick`
- `roundTickDown`, `roundTickUp`, `clampTick`, `fullRangeTicks`
- `formatPrice`, `formatPriceRatio`, `invertPrice`
- `calculateMinOutput`, `calculateMaxInput`, `calculatePriceImpact`
- `estimateSwapOutput`, `estimateSwapInput`
- `spotPrice`, `calculateLiquidity`, `calculateAmountsFromLiquidity`
- `estimateFeeEarnings`, `calculateAPR`

### Routing (`routing.ts`)

- `SwapRouter` class
- `formatRoute`
- `compareRoutes`

---

## Mock Implementation Plan

### Package Structure

```
mock-octra/
  package.json
  src/
    index.ts              # Main entry point
    hfhe.ts               # Mock HFHE implementation
    transaction.ts        # Mock TransactionBuilder
    clients/
      shield-token.ts     # Mock ShieldTokenClient
      factory.ts          # Mock FactoryClient
      pair.ts             # Mock PairClient
      router.ts           # Mock RouterClient
      ai-engine.ts        # Mock AIEngineClient
    types.ts              # Re-export real types
    constants.ts          # Re-export real constants
    errors.ts             # Re-export real errors
    mock-responses.ts     # Configurable mock response registry
```

### Key Design Decisions

1. **Re-use real types and constants** — Import from the real SDK to ensure type compatibility
2. **Simple XOR encryption** — Replace Mersenne prime arithmetic with `value XOR key` for deterministic testing
3. **No network calls** — All RPC calls return mock data from a configurable registry
4. **Injection-friendly** — Allow test code to inject custom responses for specific methods
5. **Same interface** — All classes and functions have identical signatures to the real SDK

### Implementation Priority

1. **Phase 1**: Mock HFHE (encryption/decryption) + basic types
2. **Phase 2**: Mock TransactionBuilder with response registry
3. **Phase 3**: Mock contract clients (ShieldToken, Factory, Pair, Router)
4. **Phase 4**: Integration tests and documentation

---

## File Locations

- SDK source: `/home/sprite/octrashield-dex/sdk/src/`
- Core modules: `core/` (hfhe.ts, ocs01.ts, types.ts, constants.ts, errors.ts)
- Clients: `clients/` (shield-token.ts, factory.ts, pair.ts, router.ts, ai-engine.ts)
- Utils: `utils/` (encoding.ts, math.ts, routing.ts)
- Tests: `__tests__/`

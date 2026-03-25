/**
 * Pair Client — Hybrid CPAMM + Concentrated Liquidity Pool Operations
 *
 * Client for the OctraShieldPair contract.
 * Manages liquidity positions, queries pool state, and handles
 * fee collection — all with encrypted values.
 *
 * Usage:
 * ```ts
 * const pair = new PairClient(txBuilder, hfheKeyPair, poolAddress);
 * const state = await pair.getPoolState();
 * await pair.addLiquidity({ poolId, tickLower: -1000, tickUpper: 1000, ... });
 * await pair.collectFees(positionId);
 * ```
 */

import type { TransactionBuilder } from '../core/ocs01.js';
import type {
  Address,
  PoolId,
  PoolState,
  LiquidityPosition,
  PositionId,
  EncryptedU64,
  HfheKeyPair,
  AddLiquidityParams,
  RemoveLiquidityParams,
  LiquidityResult,
  TickData,
  Observation,
  TransactionReceipt,
  Paginated,
} from '../core/types.js';
import { encrypt, decrypt, decryptValue } from '../core/hfhe.js';
import { InvalidTickRange, InsufficientLiquidity } from '../core/errors.js';
import { MIN_TICK, MAX_TICK } from '../core/constants.js';

export class PairClient {
  constructor(
    private readonly tx: TransactionBuilder,
    private readonly keyPair: HfheKeyPair,
    private readonly poolAddress: Address
  ) {}

  // --------------------------------------------------------------------------
  // View Methods — Pool State
  // --------------------------------------------------------------------------

  /**
   * Get the complete pool state including encrypted reserves.
   */
  async getPoolState(): Promise<PoolState> {
    return this.tx.viewCall<PoolState>(
      this.poolAddress,
      'view_pool_state'
    );
  }

  /**
   * Get the current tick (public, needed for routing).
   */
  async getCurrentTick(): Promise<number> {
    return this.tx.viewCall<number>(
      this.poolAddress,
      'view_current_tick'
    );
  }

  /**
   * Get encrypted reserves (only decryptable by pool participants).
   */
  async getReserves(): Promise<{ reserve0: EncryptedU64; reserve1: EncryptedU64 }> {
    return this.tx.viewCall<{ reserve0: EncryptedU64; reserve1: EncryptedU64 }>(
      this.poolAddress,
      'view_reserves'
    );
  }

  /**
   * Decrypt reserves using the local HFHE key pair.
   */
  decryptReserves(reserves: { reserve0: EncryptedU64; reserve1: EncryptedU64 }): {
    reserve0: bigint;
    reserve1: bigint;
  } {
    return {
      reserve0: decryptValue(reserves.reserve0, this.keyPair),
      reserve1: decryptValue(reserves.reserve1, this.keyPair),
    };
  }

  /**
   * Get the total encrypted liquidity in the pool.
   */
  async getLiquidity(): Promise<EncryptedU64> {
    return this.tx.viewCall<EncryptedU64>(
      this.poolAddress,
      'view_liquidity'
    );
  }

  // --------------------------------------------------------------------------
  // View Methods — Positions
  // --------------------------------------------------------------------------

  /**
   * Get a specific liquidity position by ID.
   */
  async getPosition(positionId: PositionId): Promise<LiquidityPosition> {
    return this.tx.viewCall<LiquidityPosition>(
      this.poolAddress,
      'view_position',
      [positionId]
    );
  }

  /**
   * Get all positions owned by an address.
   */
  async getPositions(
    owner: Address,
    offset: number = 0,
    limit: number = 50
  ): Promise<Paginated<LiquidityPosition>> {
    return this.tx.viewCall<Paginated<LiquidityPosition>>(
      this.poolAddress,
      'view_positions',
      [owner, offset, limit]
    );
  }

  /**
   * Get all positions for the connected wallet.
   */
  async getMyPositions(): Promise<Paginated<LiquidityPosition>> {
    const signer = this.tx.getSignerAddress();
    return this.getPositions(signer);
  }

  /**
   * Decrypt a position's liquidity and owed tokens.
   */
  decryptPosition(position: LiquidityPosition): {
    liquidity: bigint;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
  } {
    return {
      liquidity: decryptValue(position.liquidity, this.keyPair),
      tokensOwed0: decryptValue(position.tokensOwed0, this.keyPair),
      tokensOwed1: decryptValue(position.tokensOwed1, this.keyPair),
    };
  }

  // --------------------------------------------------------------------------
  // View Methods — Ticks & Observations
  // --------------------------------------------------------------------------

  /**
   * Get tick data at a specific tick index.
   */
  async getTickData(tick: number): Promise<TickData> {
    return this.tx.viewCall<TickData>(
      this.poolAddress,
      'view_tick',
      [tick]
    );
  }

  /**
   * Get all initialized ticks in a range.
   */
  async getTicksInRange(
    tickLower: number,
    tickUpper: number
  ): Promise<TickData[]> {
    return this.tx.viewCall<TickData[]>(
      this.poolAddress,
      'view_ticks_in_range',
      [tickLower, tickUpper]
    );
  }

  /**
   * Get a TWAP observation at a specific index.
   */
  async getObservation(index: number): Promise<Observation> {
    return this.tx.viewCall<Observation>(
      this.poolAddress,
      'view_observation',
      [index]
    );
  }

  /**
   * Calculate TWAP price over a period.
   */
  async getTWAP(secondsAgo: number): Promise<number> {
    const result = await this.tx.viewCall<{ tickCumulative: string; secondsAgo: number }>(
      this.poolAddress,
      'view_observe',
      [secondsAgo]
    );
    // TWAP tick = (currentCumulative - pastCumulative) / elapsed
    return Number(BigInt(result.tickCumulative)) / result.secondsAgo;
  }

  // --------------------------------------------------------------------------
  // Call Methods — Liquidity Management
  // --------------------------------------------------------------------------

  /**
   * Add liquidity to the pool.
   *
   * Creates a new concentrated liquidity position at [tickLower, tickUpper).
   * The token amounts are encrypted before submission.
   *
   * @param params - Liquidity parameters
   * @returns Liquidity result with position ID and actual amounts
   */
  async addLiquidity(params: AddLiquidityParams): Promise<LiquidityResult> {
    // Validate tick range
    this.validateTickRange(params.tickLower, params.tickUpper);

    // Encrypt amounts
    const encAmount0 = encrypt(params.amount0Desired, this.keyPair);
    const encAmount1 = encrypt(params.amount1Desired, this.keyPair);
    const encMin0 = encrypt(params.amount0Min, this.keyPair);
    const encMin1 = encrypt(params.amount1Min, this.keyPair);

    const receipt = await this.tx.callTransaction(
      this.poolAddress,
      'call_add_liquidity',
      [
        params.tickLower,
        params.tickUpper,
        encAmount0.ciphertext,
        encAmount1.ciphertext,
        encMin0.ciphertext,
        encMin1.ciphertext,
        params.recipient,
        params.deadline,
      ]
    );

    // Extract position ID and amounts from events
    const mintEvent = receipt.events.find(e => e.name === 'LiquidityAdded');
    return {
      positionId: (mintEvent?.data?.positionId || '0') as PositionId,
      amount0: (mintEvent?.data?.amount0 || encAmount0) as EncryptedU64,
      amount1: (mintEvent?.data?.amount1 || encAmount1) as EncryptedU64,
      liquidity: (mintEvent?.data?.liquidity || encAmount0) as EncryptedU64,
      txReceipt: receipt,
    };
  }

  /**
   * Remove liquidity from a position.
   *
   * @param params - Removal parameters
   * @returns Liquidity result with withdrawn amounts
   */
  async removeLiquidity(params: RemoveLiquidityParams): Promise<LiquidityResult> {
    const encLiquidity = encrypt(params.liquidityAmount, this.keyPair);
    const encMin0 = encrypt(params.amount0Min, this.keyPair);
    const encMin1 = encrypt(params.amount1Min, this.keyPair);

    const receipt = await this.tx.callTransaction(
      this.poolAddress,
      'call_remove_liquidity',
      [
        params.positionId,
        encLiquidity.ciphertext,
        encMin0.ciphertext,
        encMin1.ciphertext,
        params.deadline,
      ]
    );

    const burnEvent = receipt.events.find(e => e.name === 'LiquidityRemoved');
    return {
      positionId: params.positionId,
      amount0: (burnEvent?.data?.amount0 || encMin0) as EncryptedU64,
      amount1: (burnEvent?.data?.amount1 || encMin1) as EncryptedU64,
      liquidity: encLiquidity,
      txReceipt: receipt,
    };
  }

  /**
   * Collect accumulated fees from a position.
   *
   * @param positionId - The position to collect fees from
   * @returns Transaction receipt with fee amounts in events
   */
  async collectFees(positionId: PositionId): Promise<TransactionReceipt> {
    return this.tx.callTransaction(
      this.poolAddress,
      'call_collect_fees',
      [positionId]
    );
  }

  /**
   * Increase liquidity on an existing position.
   */
  async increaseLiquidity(
    positionId: PositionId,
    amount0Desired: bigint,
    amount1Desired: bigint,
    amount0Min: bigint,
    amount1Min: bigint,
    deadline: bigint
  ): Promise<TransactionReceipt> {
    const enc0 = encrypt(amount0Desired, this.keyPair);
    const enc1 = encrypt(amount1Desired, this.keyPair);
    const encMin0 = encrypt(amount0Min, this.keyPair);
    const encMin1 = encrypt(amount1Min, this.keyPair);

    return this.tx.callTransaction(
      this.poolAddress,
      'call_increase_liquidity',
      [positionId, enc0.ciphertext, enc1.ciphertext, encMin0.ciphertext, encMin1.ciphertext, deadline]
    );
  }

  // --------------------------------------------------------------------------
  // Convenience Methods
  // --------------------------------------------------------------------------

  /**
   * Add full-range liquidity (equivalent to CPAMM / Uniswap v2 style).
   */
  async addFullRangeLiquidity(
    amount0: bigint,
    amount1: bigint,
    tickSpacing: number,
    recipient: Address,
    deadline: bigint
  ): Promise<LiquidityResult> {
    const tickLower = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;

    return this.addLiquidity({
      poolId: '' as PoolId, // Pool ID is implicit from the contract address
      tickLower,
      tickUpper,
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient,
      deadline,
    });
  }

  /**
   * Get a summary of all positions with decrypted values.
   */
  async getPositionSummary(): Promise<Array<{
    position: LiquidityPosition;
    liquidity: bigint;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
    inRange: boolean;
  }>> {
    const currentTick = await this.getCurrentTick();
    const positions = await this.getMyPositions();

    return positions.items.map(pos => {
      const decrypted = this.decryptPosition(pos);
      return {
        position: pos,
        ...decrypted,
        inRange: currentTick >= pos.tickLower && currentTick < pos.tickUpper,
      };
    });
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private validateTickRange(tickLower: number, tickUpper: number): void {
    if (tickLower >= tickUpper) {
      throw new InvalidTickRange(tickLower, tickUpper, 0);
    }
    if (tickLower < MIN_TICK || tickUpper > MAX_TICK) {
      throw new InvalidTickRange(tickLower, tickUpper, 0);
    }
  }
}

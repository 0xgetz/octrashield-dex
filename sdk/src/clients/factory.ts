/**
 * Factory Client — Pool Registry & Deployer
 *
 * Client for the OctraShieldFactory contract.
 * Creates new liquidity pools and queries the pool registry.
 *
 * Usage:
 * ```ts
 * const factory = new FactoryClient(txBuilder, factoryAddress);
 * const pool = await factory.getPool(tokenA, tokenB, 2);
 * const receipt = await factory.createPool({ token0, token1, feeTier: 2, initialSqrtPrice });
 * ```
 */

import type { TransactionBuilder } from '../core/ocs01.js';
import type {
  Address,
  PoolInfo,
  PoolId,
  CreatePoolParams,
  TransactionReceipt,
  Paginated,
} from '../core/types.js';
import type { FeeTierId } from '../core/constants.js';
import { FEE_TIERS } from '../core/constants.js';
import { PoolNotFound, PoolAlreadyExists } from '../core/errors.js';
import { sortTokens } from '../utils/encoding.js';

export class FactoryClient {
  constructor(
    private readonly tx: TransactionBuilder,
    private readonly keyPair: import('../core/types.js').HfheKeyPair,
    private readonly factoryAddress: Address
  ) {}

  /**
   * Get the factory contract address.
   */
  get address(): Address {
    return this.factoryAddress;
  }

  // --------------------------------------------------------------------------
  // View Methods
  // --------------------------------------------------------------------------

  /**
   * Get pool info for a specific token pair and fee tier.
   * Returns null if no pool exists.
   */
  async getPair(tokenA: Address, tokenB: Address): Promise<Address> {
    const [token0, token1] = sortTokens(tokenA, tokenB);
    return this.tx.query<Address>(
      this.factoryAddress,
      'view_get_pool',
      [token0, token1, 0]
    );
  }

  async getPool(
    tokenA: Address,
    tokenB: Address,
    feeTier: FeeTierId
  ): Promise<PoolInfo | null> {
    const [token0, token1] = sortTokens(tokenA, tokenB);

    try {
      const pool = await this.tx.query<PoolInfo | null>(
        this.factoryAddress,
        'view_get_pool',
        [token0, token1, feeTier]
      );
      return pool;
    } catch {
      return null;
    }
  }

  /**
   * Get all registered pools.
   */
  async allPairs(): Promise<Address[]> {
    return this.tx.query<Address[]>(
      this.factoryAddress,
      'view_all_pools'
    );
  }

  async getAllPools(
    offset: number = 0,
    limit: number = 50
  ): Promise<Paginated<PoolInfo>> {
    return this.tx.query<Paginated<PoolInfo>>(
      this.factoryAddress,
      'view_all_pools',
      [offset, limit]
    );
  }

  /**
   * Get all pools involving a specific token.
   */
  async getPoolsForToken(token: Address): Promise<PoolInfo[]> {
    return this.tx.query<PoolInfo[]>(
      this.factoryAddress,
      'view_pools_for_token',
      [token]
    );
  }

  /**
   * Get the total number of pools.
   */
  async pairCount(): Promise<bigint> {
    return this.tx.query<bigint>(
      this.factoryAddress,
      'view_pool_count'
    );
  }

  async getPoolCount(): Promise<number> {
    return this.tx.query<number>(
      this.factoryAddress,
      'view_pool_count'
    );
  }

  /**
   * Get all available fee tiers and their tick spacings.
   */
  async getFeeTiers(): Promise<typeof FEE_TIERS> {
    return this.tx.query<typeof FEE_TIERS>(
      this.factoryAddress,
      'view_all_fee_tiers'
    );
  }

  /**
   * Get the factory owner address.
   */
  async getOwner(): Promise<Address> {
    return this.tx.query<Address>(
      this.factoryAddress,
      'view_owner'
    );
  }

  /**
   * Check if a pool exists for a given token pair and fee tier.
   */
  async poolExists(
    tokenA: Address,
    tokenB: Address,
    feeTier: FeeTierId
  ): Promise<boolean> {
    const pool = await this.getPool(tokenA, tokenB, feeTier);
    return pool !== null;
  }

  // --------------------------------------------------------------------------
  // Call Methods
  // --------------------------------------------------------------------------

  /**
   * Create a new liquidity pool.
   *
   * @param params - Pool creation parameters
   * @returns Transaction receipt with PoolCreated event
   * @throws PoolAlreadyExists if the pool already exists
   */
  async createPair(
    tokenA: Address,
    tokenB: Address,
    feeTier: number
  ): Promise<TransactionReceipt> {
    const [token0, token1] = sortTokens(tokenA, tokenB);
    return this.tx.execute(
      this.factoryAddress,
      'call_create_pool',
      [token0, token1, feeTier, 0n]
    );
  }

  async createPool(params: CreatePoolParams): Promise<TransactionReceipt> {
    const [token0, token1] = sortTokens(params.token0, params.token1);

    // Check if pool already exists
    const existing = await this.getPool(token0, token1, params.feeTier);
    if (existing) {
      throw new PoolAlreadyExists(
        token0 as string,
        token1 as string,
        params.feeTier
      );
    }

    return this.tx.execute(
      this.factoryAddress,
      'call_create_pool',
      [token0, token1, params.feeTier, params.initialSqrtPrice]
    );
  }

  /**
   * Enable a new fee tier (owner only).
   */
  async enableFeeTier(
    feeBps: number,
    tickSpacing: number
  ): Promise<TransactionReceipt> {
    return this.tx.execute(
      this.factoryAddress,
      'call_enable_fee_tier',
      [feeBps, tickSpacing]
    );
  }

  /**
   * Transfer factory ownership (owner only).
   */
  async transferOwnership(newOwner: Address): Promise<TransactionReceipt> {
    return this.tx.execute(
      this.factoryAddress,
      'call_transfer_ownership',
      [newOwner]
    );
  }

  // --------------------------------------------------------------------------
  // Convenience Methods
  // --------------------------------------------------------------------------

  /**
   * Get or create a pool. Returns existing pool if it exists,
   * otherwise creates a new one.
   */
  async getOrCreatePool(
    params: CreatePoolParams
  ): Promise<{ pool: PoolInfo; created: boolean; receipt?: TransactionReceipt }> {
    const existing = await this.getPool(params.token0, params.token1, params.feeTier);

    if (existing) {
      return { pool: existing, created: false };
    }

    const receipt = await this.createPool(params);

    // Fetch the newly created pool
    const newPool = await this.getPool(params.token0, params.token1, params.feeTier);
    if (!newPool) {
      throw new PoolNotFound(`Pool creation succeeded but pool not found in registry`);
    }

    return { pool: newPool, created: true, receipt };
  }

  /**
   * Find the best fee tier for a token pair based on existing liquidity.
   * Returns the fee tier with the most active pool, or null if no pools exist.
   */
  async findBestFeeTier(
    tokenA: Address,
    tokenB: Address
  ): Promise<FeeTierId | null> {
    const tiers: FeeTierId[] = [0, 1, 2, 3];
    const pools = await Promise.all(
      tiers.map(tier => this.getPool(tokenA, tokenB, tier))
    );

    // Return the first active pool's fee tier
    for (let i = 0; i < pools.length; i++) {
      if (pools[i]?.isActive) return tiers[i];
    }

    return null;
  }
}

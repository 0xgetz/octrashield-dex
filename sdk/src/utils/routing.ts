/**
 * OctraShield DEX SDK — Multi-Hop Swap Route Finder
 *
 * Finds optimal swap routes across all registered pools.
 * Supports up to MAX_SWAP_HOPS (4) intermediate hops.
 * Uses a modified Dijkstra's algorithm weighted by:
 *   - Estimated output amount (primary)
 *   - Price impact (secondary)
 *   - Number of hops / gas cost (tertiary)
 *
 * All route finding operates on PUBLIC data (tick indices, pool existence).
 * Actual reserve values are encrypted — output estimates use tick-derived prices.
 */

import type { Address, PoolId, PoolInfo, SwapRoute, SwapHop } from '../core/types.js';
import type { FeeTierId } from '../core/constants.js';
import { MAX_SWAP_HOPS, FEE_TIERS, FEE_DENOMINATOR } from '../core/constants.js';
import { tickToPrice } from './math.js';
import { sortTokens, computePoolId } from './encoding.js';

// ============================================================================
// Pool Graph
// ============================================================================

/**
 * Internal representation of a pool for routing.
 */
interface PoolNode {
  readonly poolId: PoolId;
  readonly token0: Address;
  readonly token1: Address;
  readonly feeTier: FeeTierId;
  readonly currentTick: number;
  readonly isActive: boolean;
}

/**
 * Graph edge connecting two tokens through a pool.
 */
interface Edge {
  readonly pool: PoolNode;
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly to: Address;
  readonly estimatedPrice: number;
  readonly feeBps: number;
}

/**
 * Pool graph: adjacency list from token address to outgoing edges.
 */
type PoolGraph = Map<string, Edge[]>;

/**
 * Route candidate during search.
 */
interface RouteCandidate {
  readonly hops: Edge[];
  readonly estimatedOutput: number;
  readonly totalFeeBps: number;
  readonly totalPriceImpact: number;
}

// ============================================================================
// Router Class
// ============================================================================

/**
 * Multi-hop swap route finder.
 *
 * Usage:
 * ```ts
 * const router = new SwapRouter();
 * router.loadPools(poolInfoArray);
 * const routes = router.findRoutes(tokenIn, tokenOut, amountIn);
 * const best = router.findBestRoute(tokenIn, tokenOut, amountIn);
 * ```
 */
export class SwapRouter {
  private graph: PoolGraph = new Map();
  private pools: Map<string, PoolNode> = new Map();

  /**
   * Load pool data into the routing graph.
   * Call this whenever pool state changes (new pools, tick updates).
   */
  loadPools(pools: readonly PoolInfo[]): void {
    this.graph.clear();
    this.pools.clear();

    for (const pool of pools) {
      if (!pool.isActive) continue;

      const node: PoolNode = {
        poolId: pool.poolId,
        token0: pool.token0,
        token1: pool.token1,
        feeTier: pool.feeTier,
        currentTick: 0, // Will be updated from on-chain
        isActive: pool.isActive,
      };

      this.pools.set(pool.poolId as string, node);

      const feeBps = FEE_TIERS[pool.feeTier].fee_bps;

      // Add bidirectional edges
      // token0 -> token1
      this.addEdge(pool.token0, {
        pool: node,
        tokenIn: pool.token0,
        tokenOut: pool.token1,
        to: pool.token1,
        estimatedPrice: 1, // Updated from tick data
        feeBps,
      });

      // token1 -> token0
      this.addEdge(pool.token1, {
        pool: node,
        tokenIn: pool.token1,
        tokenOut: pool.token0,
        to: pool.token0,
        estimatedPrice: 1, // Updated from tick data
        feeBps,
      });
    }
  }

  /**
   * Update tick data for routing price estimates.
   */
  updatePoolTick(poolId: PoolId, currentTick: number): void {
    const pool = this.pools.get(poolId as string);
    if (!pool) return;

    // Update edges with tick-derived prices
    const price = tickToPrice(currentTick);

    const edges0 = this.graph.get(pool.token0 as string);
    if (edges0) {
      for (let i = 0; i < edges0.length; i++) {
        if (edges0[i].pool.poolId === poolId) {
          edges0[i] = { ...edges0[i], estimatedPrice: price };
        }
      }
    }

    const edges1 = this.graph.get(pool.token1 as string);
    if (edges1) {
      for (let i = 0; i < edges1.length; i++) {
        if (edges1[i].pool.poolId === poolId) {
          edges1[i] = { ...edges1[i], estimatedPrice: 1 / price };
        }
      }
    }
  }

  /**
   * Find all valid routes from tokenIn to tokenOut.
   * Returns routes sorted by estimated output (best first).
   *
   * @param tokenIn - Input token address
   * @param tokenOut - Output token address
   * @param amountIn - Input amount for estimation
   * @param maxHops - Maximum number of intermediate hops (default: MAX_SWAP_HOPS)
   * @returns Array of route candidates, sorted by estimated output (descending)
   */
  findRoutes(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    maxHops: number = MAX_SWAP_HOPS
  ): SwapRoute[] {
    const candidates: RouteCandidate[] = [];
    const visited = new Set<string>();

    // DFS with backtracking
    this.dfsRoutes(
      tokenIn as string,
      tokenOut as string,
      Number(amountIn),
      maxHops,
      [],
      0,
      visited,
      candidates
    );

    // Sort by estimated output (descending)
    candidates.sort((a, b) => b.estimatedOutput - a.estimatedOutput);

    // Convert to SwapRoute format
    return candidates.map(c => this.candidateToRoute(c, tokenIn, tokenOut, amountIn));
  }

  /**
   * Find the single best route from tokenIn to tokenOut.
   * Returns null if no route exists.
   */
  findBestRoute(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint
  ): SwapRoute | null {
    const routes = this.findRoutes(tokenIn, tokenOut, amountIn);
    return routes.length > 0 ? routes[0] : null;
  }

  /**
   * Check if a direct (single-hop) route exists between two tokens.
   */
  hasDirectRoute(tokenIn: Address, tokenOut: Address): boolean {
    const edges = this.graph.get(tokenIn as string);
    if (!edges) return false;
    return edges.some(e => (e.tokenOut as string) === (tokenOut as string));
  }

  /**
   * Get all tokens reachable from a given token within N hops.
   */
  getReachableTokens(token: Address, maxHops: number = 2): Address[] {
    const reachable = new Set<string>();
    const queue: Array<{ addr: string; depth: number }> = [{ addr: token as string, depth: 0 }];

    while (queue.length > 0) {
      const { addr, depth } = queue.shift()!;
      if (depth >= maxHops) continue;

      const edges = this.graph.get(addr);
      if (!edges) continue;

      for (const edge of edges) {
        const outAddr = edge.tokenOut as string;
        if (!reachable.has(outAddr) && outAddr !== (token as string)) {
          reachable.add(outAddr);
          queue.push({ addr: outAddr, depth: depth + 1 });
        }
      }
    }

    return Array.from(reachable) as Address[];
  }

  /**
   * Get the total number of pools in the routing graph.
   */
  getPoolCount(): number {
    return this.pools.size;
  }

  /**
   * Get all pool IDs involving a specific token.
   */
  getPoolsForToken(token: Address): PoolId[] {
    const edges = this.graph.get(token as string);
    if (!edges) return [];
    return [...new Set(edges.map(e => e.pool.poolId))];
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private addEdge(token: Address, edge: Edge): void {
    const key = token as string;
    if (!this.graph.has(key)) {
      this.graph.set(key, []);
    }
    this.graph.get(key)!.push(edge);
  }

  /**
   * DFS route finder with backtracking.
   * Explores all paths from current token to target, up to maxHops.
   */
  private dfsRoutes(
    current: string,
    target: string,
    currentAmount: number,
    remainingHops: number,
    path: Edge[],
    totalFeeBps: number,
    visited: Set<string>,
    results: RouteCandidate[]
  ): void {
    if (current === target && path.length > 0) {
      results.push({
        hops: [...path],
        estimatedOutput: currentAmount,
        totalFeeBps,
        totalPriceImpact: 0, // Simplified: would need actual reserves
      });
      return;
    }

    if (remainingHops === 0) return;

    const edges = this.graph.get(current);
    if (!edges) return;

    // Prevent visiting the same pool twice in a route
    for (const edge of edges) {
      const poolKey = edge.pool.poolId as string;
      if (visited.has(poolKey)) continue;

      // Estimate output through this edge
      const feeMultiplier = (FEE_DENOMINATOR - edge.feeBps) / FEE_DENOMINATOR;
      const outputAmount = currentAmount * edge.estimatedPrice * feeMultiplier;

      if (outputAmount <= 0) continue;

      visited.add(poolKey);
      path.push(edge);

      this.dfsRoutes(
        edge.tokenOut as string,
        target,
        outputAmount,
        remainingHops - 1,
        path,
        totalFeeBps + edge.feeBps,
        visited,
        results
      );

      path.pop();
      visited.delete(poolKey);
    }
  }

  /**
   * Convert an internal route candidate to the public SwapRoute type.
   */
  private candidateToRoute(
    candidate: RouteCandidate,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint
  ): SwapRoute {
    const hops: SwapHop[] = candidate.hops.map(edge => ({
      poolId: edge.pool.poolId,
      tokenIn: edge.tokenIn,
      tokenOut: edge.tokenOut,
      feeTier: edge.pool.feeTier,
    }));

    // Estimate price impact (simplified)
    const expectedOutput = BigInt(Math.floor(candidate.estimatedOutput));
    const midPrice = Number(amountIn) > 0
      ? candidate.estimatedOutput / Number(amountIn)
      : 0;

    return {
      hops,
      tokenIn,
      tokenOut,
      estimatedOutput: expectedOutput,
      priceImpactBps: Math.round(candidate.totalPriceImpact),
      totalFeeBps: candidate.totalFeeBps,
    };
  }
}

// ============================================================================
// Route Formatting
// ============================================================================

/**
 * Format a swap route as a human-readable path string.
 * e.g., "ETH -> [0.30%] -> USDC -> [0.05%] -> DAI"
 */
export function formatRoute(
  route: SwapRoute,
  tokenSymbols: Map<string, string>
): string {
  if (route.hops.length === 0) return 'No route';

  let path = tokenSymbols.get(route.tokenIn as string) || truncate(route.tokenIn as string);

  for (const hop of route.hops) {
    const fee = FEE_TIERS[hop.feeTier].fee_bps;
    const symbol = tokenSymbols.get(hop.tokenOut as string) || truncate(hop.tokenOut as string);
    path += ` -> [${(fee / 100).toFixed(2)}%] -> ${symbol}`;
  }

  return path;
}

/**
 * Compare two routes and return the better one.
 * Better = higher estimated output, then lower fee, then fewer hops.
 */
export function comparRoutes(a: SwapRoute, b: SwapRoute): SwapRoute {
  if (a.estimatedOutput > b.estimatedOutput) return a;
  if (b.estimatedOutput > a.estimatedOutput) return b;
  if (a.totalFeeBps < b.totalFeeBps) return a;
  if (b.totalFeeBps < a.totalFeeBps) return b;
  return a.hops.length <= b.hops.length ? a : b;
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ============================================================================
// Standalone Functions for Testing
// ============================================================================

/** Maximum number of hops allowed in a route. */
export const MAX_HOPS = MAX_SWAP_HOPS;

/**
 * Build a graph from an array of mock pool data.
 * Used for testing and simple routing scenarios.
 */
export function buildGraph(pools: readonly any[]): PoolGraph {
  const graph: PoolGraph = new Map();

  for (const pool of pools) {
    const token0 = pool.token0 as string;
    const token1 = pool.token1 as string;
    const poolId = (pool.id || pool.poolId) as string;

    // Add bidirectional edges
    if (!graph.has(token0)) graph.set(token0, []);
    if (!graph.has(token1)) graph.set(token1, []);

    const feeBps = pool.feeBps || 30;

    // Create a proper PoolNode
    const node: PoolNode = {
      poolId: poolId as PoolId,
      token0: pool.token0,
      token1: pool.token1,
      feeTier: pool.feeTier !== undefined ? pool.feeTier : 0,
      currentTick: 0,
      isActive: true,
    };

    graph.get(token0)!.push({
      pool: node,
      tokenIn: pool.token0,
      tokenOut: pool.token1,
      to: pool.token1,
      estimatedPrice: 1,
      feeBps,
    });

    graph.get(token1)!.push({
      pool: node,
      tokenIn: pool.token1,
      tokenOut: pool.token0,
      to: pool.token0,
      estimatedPrice: 1,
      feeBps,
    });
  }

  return graph;
}

/**
 * Find the best route between two tokens using a simple graph.
 * This is a standalone function for testing compatibility.
 */
export function findBestRoute(
  pools: readonly any[],
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): SwapRoute | null {
  if ((tokenIn as string) === (tokenOut as string)) {
    return null; // Same token, no route needed
  }

  const graph = buildGraph(pools);
  const candidates: RouteCandidate[] = [];
  const visited = new Set<string>();

  // DFS to find all routes
  function dfs(
    current: string,
    target: string,
    currentAmount: number,
    remainingHops: number,
    path: Edge[],
    totalFeeBps: number
  ): void {
    if (current === target && path.length > 0) {
      candidates.push({
        hops: [...path],
        estimatedOutput: currentAmount,
        totalFeeBps,
        totalPriceImpact: 0,
      });
      return;
    }

    if (remainingHops === 0) return;

    const edges = graph.get(current);
    if (!edges) return;

    for (const edge of edges) {
      const poolKey = edge.pool.poolId as string;
      if (visited.has(poolKey)) continue;

      const feeMultiplier = (FEE_DENOMINATOR - edge.feeBps) / FEE_DENOMINATOR;
      const outputAmount = currentAmount * edge.estimatedPrice * feeMultiplier;

      if (outputAmount <= 0) continue;

      visited.add(poolKey);
      path.push(edge);

      dfs(
        edge.tokenOut as string,
        target,
        outputAmount,
        remainingHops - 1,
        path,
        totalFeeBps + edge.feeBps
      );

      path.pop();
      visited.delete(poolKey);
    }
  }

  dfs(tokenIn as string, tokenOut as string, Number(amountIn), MAX_HOPS, [], 0);

  if (candidates.length === 0) return null;

  // Sort by estimated output (descending)
  candidates.sort((a, b) => b.estimatedOutput - a.estimatedOutput);

  const best = candidates[0];
  const hops: SwapHop[] = best.hops.map(edge => ({
    poolId: edge.pool.poolId,
    tokenIn: edge.tokenIn,
    tokenOut: edge.tokenOut,
    feeTier: edge.pool.feeTier,
  }));

  return {
    hops,
    tokenIn,
    tokenOut,
    estimatedOutput: BigInt(Math.floor(best.estimatedOutput)),
    outputAmount: BigInt(Math.floor(best.estimatedOutput)),
    priceImpactBps: 0,
    totalFeeBps: best.totalFeeBps,
  };
}

/**
 * Encode a route as a string for transmission.
 */
export function encodeRoute(route: SwapRoute): string {
  if (route.hops.length === 0) return '';

  const parts = route.hops.map(hop =>
    `${hop.poolId}:${hop.tokenIn}:${hop.tokenOut}`
  );
  return parts.join('|');
}

/**
 * Decode a route from an encoded string.
 */
export function decodeRoute(encoded: string): SwapRoute {
  if (!encoded || encoded.length === 0) {
    throw new Error('Invalid route encoding: empty string');
  }

  const parts = encoded.split('|');
  if (parts.length === 0) {
    throw new Error('Invalid route encoding: no parts');
  }

  const hops: SwapHop[] = [];
  for (const part of parts) {
    const [poolId, tokenIn, tokenOut] = part.split(':');
    if (!poolId || !tokenIn || !tokenOut) {
      throw new Error(`Invalid route encoding: malformed part "${part}"`);
    }
    hops.push({
      poolId: poolId as PoolId,
      tokenIn: tokenIn as Address,
      tokenOut: tokenOut as Address,
      feeTier: 0 as FeeTierId,
    });
  }

  return {
    hops,
    tokenIn: hops[0].tokenIn,
    tokenOut: hops[hops.length - 1].tokenOut,
    estimatedOutput: 0n,
    priceImpactBps: 0,
    totalFeeBps: 0,
  };
}

/**
 * Score a route based on output amount and number of hops.
 * Higher score = better route.
 */
export function scoreRoute(route: SwapRoute): number {
  // Base score from output amount
  const outputScore = Number(route.estimatedOutput);
  // Penalty for each hop (gas cost)
  const hopPenalty = route.hops.length * 1000;
  // Fee penalty
  const feePenalty = route.totalFeeBps;

  return Math.max(0, outputScore - hopPenalty - feePenalty);
}

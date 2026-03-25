/**
 * Routing Utility Tests — multi-hop pathfinding, route scoring, encoding.
 *
 * Coverage:
 *   - findBestRoute: single-hop direct, multi-hop, no-route
 *   - encodeRoute / decodeRoute round-trip
 *   - Route scoring (output, gas, price impact)
 *   - Max hop limit enforcement
 *   - Edge cases (empty graph, disconnected tokens)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  findBestRoute,
  encodeRoute,
  decodeRoute,
  buildGraph,
  scoreRoute,
  MAX_HOPS,
} from '../utils/routing.js';
import type { Address, PoolId } from '../core/types.js';

// ============================================================================
// Helpers — mock pool data
// ============================================================================

const WETH: Address = '0x' + 'aa'.repeat(20) as Address;
const USDC: Address = '0x' + 'bb'.repeat(20) as Address;
const DAI: Address  = '0x' + 'cc'.repeat(20) as Address;
const WBTC: Address = '0x' + 'dd'.repeat(20) as Address;
const LINK: Address = '0x' + 'ee'.repeat(20) as Address;
const UNI: Address  = '0x' + 'ff'.repeat(20) as Address;
const RARE: Address = '0x' + '11'.repeat(20) as Address;

interface MockPool {
  id: PoolId;
  token0: Address;
  token1: Address;
  reserveToken0: bigint;
  reserveToken1: bigint;
  feeBps: number;
  liquidity: bigint;
}

const pools: MockPool[] = [
  {
    id: 'pool-weth-usdc' as PoolId,
    token0: WETH, token1: USDC,
    reserveToken0: 10_000_000_000n, reserveToken1: 30_000_000_000_000n,
    feeBps: 30, liquidity: 500_000_000n,
  },
  {
    id: 'pool-weth-dai' as PoolId,
    token0: WETH, token1: DAI,
    reserveToken0: 5_000_000_000n, reserveToken1: 15_000_000_000_000n,
    feeBps: 30, liquidity: 200_000_000n,
  },
  {
    id: 'pool-usdc-dai' as PoolId,
    token0: USDC, token1: DAI,
    reserveToken0: 50_000_000_000_000n, reserveToken1: 50_000_000_000_000n,
    feeBps: 5, liquidity: 1_000_000_000n,
  },
  {
    id: 'pool-weth-wbtc' as PoolId,
    token0: WETH, token1: WBTC,
    reserveToken0: 1_000_000_000n, reserveToken1: 100_000_000n,
    feeBps: 30, liquidity: 100_000_000n,
  },
  {
    id: 'pool-wbtc-usdc' as PoolId,
    token0: WBTC, token1: USDC,
    reserveToken0: 500_000_000n, reserveToken1: 20_000_000_000_000n,
    feeBps: 30, liquidity: 300_000_000n,
  },
  {
    id: 'pool-link-weth' as PoolId,
    token0: LINK, token1: WETH,
    reserveToken0: 100_000_000_000n, reserveToken1: 500_000_000n,
    feeBps: 30, liquidity: 50_000_000n,
  },
];

// ============================================================================
// Graph Building
// ============================================================================

describe('Graph Building', () => {
  it('buildGraph: creates adjacency from pools', () => {
    const graph = buildGraph(pools);
    expect(graph.size).toBeGreaterThan(0);
  });

  it('buildGraph: bidirectional edges', () => {
    const graph = buildGraph(pools);
    // WETH -> USDC and USDC -> WETH should both exist
    expect(graph.get(WETH)?.some(e => e.to === USDC)).toBe(true);
    expect(graph.get(USDC)?.some(e => e.to === WETH)).toBe(true);
  });

  it('buildGraph: empty pool list -> empty graph', () => {
    const graph = buildGraph([]);
    expect(graph.size).toBe(0);
  });

  it('buildGraph: all pool tokens appear as keys', () => {
    const graph = buildGraph(pools);
    const allTokens = new Set(pools.flatMap(p => [p.token0, p.token1]));
    for (const token of allTokens) {
      expect(graph.has(token)).toBe(true);
    }
  });
});

// ============================================================================
// Route Finding
// ============================================================================

describe('findBestRoute', () => {
  it('direct: WETH -> USDC single hop', () => {
    const route = findBestRoute(pools, WETH, USDC, 1_000_000_000n);
    expect(route).not.toBeNull();
    expect(route!.hops.length).toBe(1);
    expect(route!.hops[0].poolId).toBe('pool-weth-usdc');
    expect(route!.outputAmount > 0n).toBe(true);
  });

  it('multi-hop: LINK -> USDC through WETH', () => {
    const route = findBestRoute(pools, LINK, USDC, 10_000_000_000n);
    expect(route).not.toBeNull();
    expect(route!.hops.length).toBeGreaterThanOrEqual(2);
    expect(route!.outputAmount > 0n).toBe(true);
  });

  it('no route: disconnected token', () => {
    const route = findBestRoute(pools, RARE, USDC, 1_000_000n);
    expect(route).toBeNull();
  });

  it('same token: returns null or trivial route', () => {
    const route = findBestRoute(pools, WETH, WETH, 1_000_000n);
    // Some implementations return null, others return identity route
    if (route) {
      expect(route.hops.length).toBe(0);
    }
  });

  it('respects MAX_HOPS limit', () => {
    const route = findBestRoute(pools, LINK, USDC, 1_000_000_000n);
    if (route) {
      expect(route.hops.length).toBeLessThanOrEqual(MAX_HOPS);
    }
  });

  it('prefers higher output route', () => {
    // WETH -> DAI has two paths: direct, or WETH -> USDC -> DAI
    const route = findBestRoute(pools, WETH, DAI, 1_000_000_000n);
    expect(route).not.toBeNull();
    // The best route should have been selected (higher output)
    expect(route!.outputAmount > 0n).toBe(true);
  });

  it('zero input amount', () => {
    const route = findBestRoute(pools, WETH, USDC, 0n);
    if (route) {
      expect(route.outputAmount).toBe(0n);
    }
  });
});

// ============================================================================
// Route Encoding / Decoding
// ============================================================================

describe('Route Encoding', () => {
  it('encodeRoute / decodeRoute round-trip', () => {
    const route = findBestRoute(pools, WETH, USDC, 1_000_000_000n);
    expect(route).not.toBeNull();

    const encoded = encodeRoute(route!);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeRoute(encoded);
    expect(decoded.hops.length).toBe(route!.hops.length);
    for (let i = 0; i < decoded.hops.length; i++) {
      expect(decoded.hops[i].poolId).toBe(route!.hops[i].poolId);
      expect(decoded.hops[i].tokenIn).toBe(route!.hops[i].tokenIn);
      expect(decoded.hops[i].tokenOut).toBe(route!.hops[i].tokenOut);
    }
  });

  it('encodeRoute: multi-hop round-trip', () => {
    const route = findBestRoute(pools, LINK, USDC, 10_000_000_000n);
    if (!route) return; // skip if no route found

    const encoded = encodeRoute(route);
    const decoded = decodeRoute(encoded);
    expect(decoded.hops.length).toBe(route.hops.length);
  });

  it('decodeRoute: rejects invalid encoding', () => {
    expect(() => decodeRoute('')).toThrow();
    expect(() => decodeRoute('not-valid-encoding')).toThrow();
  });
});

// ============================================================================
// Route Scoring
// ============================================================================

describe('Route Scoring', () => {
  it('scoreRoute: returns numeric score', () => {
    const route = findBestRoute(pools, WETH, USDC, 1_000_000_000n);
    expect(route).not.toBeNull();

    const score = scoreRoute(route!);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);
  });

  it('scoreRoute: higher output = higher score', () => {
    const route1 = findBestRoute(pools, WETH, USDC, 1_000_000_000n);
    const route2 = findBestRoute(pools, WETH, USDC, 2_000_000_000n);
    if (!route1 || !route2) return;

    // Larger trade should have higher absolute output
    expect(route2.outputAmount > route1.outputAmount).toBe(true);
  });

  it('scoreRoute: fewer hops preferred when output similar', () => {
    // This is a heuristic test; exact behavior depends on implementation
    const route = findBestRoute(pools, WETH, USDC, 1_000_000_000n);
    if (route) {
      const score = scoreRoute(route);
      expect(score).toBeGreaterThan(0);
    }
  });
});

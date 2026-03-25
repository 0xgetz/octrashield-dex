/**
 * usePool — Pool State & Position Management Hook
 *
 * Reactive hook for querying pool state, reserves, positions,
 * and tick data. Auto-refreshes on a configurable interval.
 *
 * Usage:
 * ```tsx
 * function PoolView({ poolAddress }: { poolAddress: Address }) {
 *   const { state, reserves, positions, currentTick, refresh } = usePool(poolAddress);
 *
 *   if (!state) return <div>Loading...</div>;
 *   return (
 *     <div>
 *       <p>Current Tick: {currentTick}</p>
 *       <p>Positions: {positions.length}</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Address,
  PoolState,
  PoolId,
  EncryptedU64,
  HfheKeyPair,
  LiquidityPosition,
  TickData,
  Observation,
  Paginated,
} from '../core/types.js';
import { PairClient } from '../clients/pair.js';
import type { TransactionBuilder } from '../core/ocs01.js';

export interface UsePoolOptions {
  /** Auto-refresh interval in ms (0 = disabled, default: 15000) */
  refreshInterval?: number;
  /** Automatically fetch positions for connected wallet */
  fetchMyPositions?: boolean;
  /** Tick range to pre-fetch tick data for */
  tickRange?: { lower: number; upper: number };
}

export interface UsePoolResult {
  /** Full pool state including encrypted reserves */
  readonly state: PoolState | null;
  /** Current tick (public) */
  readonly currentTick: number | null;
  /** Encrypted reserves */
  readonly reserves: { reserve0: EncryptedU64; reserve1: EncryptedU64 } | null;
  /** Decrypted reserves (if key pair available) */
  readonly decryptedReserves: { reserve0: bigint; reserve1: bigint } | null;
  /** Connected wallet's liquidity positions */
  readonly positions: readonly LiquidityPosition[];
  /** Tick data within the requested range */
  readonly ticks: readonly TickData[];
  /** Whether data is currently loading */
  readonly isLoading: boolean;
  /** Error from the last fetch attempt */
  readonly error: Error | null;
  /** Manually trigger a refresh */
  readonly refresh: () => Promise<void>;
}

/**
 * Hook for querying and watching pool state.
 *
 * @param poolAddress - The pool contract address
 * @param txBuilder - Transaction builder from useOctraShield
 * @param keyPair - HFHE key pair for decryption
 * @param options - Configuration options
 */
export function usePool(
  poolAddress: Address | null,
  txBuilder: TransactionBuilder | null,
  keyPair: HfheKeyPair | null,
  options: UsePoolOptions = {}
): UsePoolResult {
  const {
    refreshInterval = 15000,
    fetchMyPositions = true,
    tickRange,
  } = options;

  const [state, setState] = useState<PoolState | null>(null);
  const [currentTick, setCurrentTick] = useState<number | null>(null);
  const [reserves, setReserves] = useState<{ reserve0: EncryptedU64; reserve1: EncryptedU64 } | null>(null);
  const [decryptedReserves, setDecryptedReserves] = useState<{ reserve0: bigint; reserve1: bigint } | null>(null);
  const [positions, setPositions] = useState<readonly LiquidityPosition[]>([]);
  const [ticks, setTicks] = useState<readonly TickData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<PairClient | null>(null);

  // Create client when dependencies change
  useEffect(() => {
    if (poolAddress && txBuilder && keyPair) {
      clientRef.current = new PairClient(txBuilder, keyPair, poolAddress);
    } else {
      clientRef.current = null;
    }
  }, [poolAddress, txBuilder, keyPair]);

  // Fetch all pool data
  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch state and reserves in parallel
      const [poolState, poolReserves] = await Promise.all([
        client.getPoolState(),
        client.getReserves(),
      ]);

      setState(poolState);
      setCurrentTick(poolState.currentTick);
      setReserves(poolReserves);

      // Decrypt reserves if key pair is available
      if (keyPair) {
        try {
          const decrypted = client.decryptReserves(poolReserves);
          setDecryptedReserves(decrypted);
        } catch {
          setDecryptedReserves(null);
        }
      }

      // Fetch positions for connected wallet
      if (fetchMyPositions) {
        try {
          const myPositions = await client.getMyPositions();
          setPositions(myPositions.items);
        } catch {
          setPositions([]);
        }
      }

      // Fetch tick data if range specified
      if (tickRange) {
        try {
          const tickData = await client.getTicksInRange(tickRange.lower, tickRange.upper);
          setTicks(tickData);
        } catch {
          setTicks([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [keyPair, fetchMyPositions, tickRange]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!clientRef.current) return;

    refresh();

    if (refreshInterval > 0) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refresh, refreshInterval, poolAddress]);

  return {
    state,
    currentTick,
    reserves,
    decryptedReserves,
    positions,
    ticks,
    isLoading,
    error,
    refresh,
  };
}

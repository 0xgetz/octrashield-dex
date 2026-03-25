/**
 * useLiquidity — Liquidity Position Management Hook
 *
 * Manages the complete liquidity lifecycle: adding, removing, increasing,
 * collecting fees, and viewing position summaries with decrypted values.
 *
 * Usage:
 * ```tsx
 * function LiquidityPanel({ poolAddress }: { poolAddress: Address }) {
 *   const {
 *     positions, addLiquidity, removeLiquidity, collectFees, isAdding
 *   } = useLiquidity(txBuilder, keyPair, poolAddress);
 *
 *   return (
 *     <div>
 *       <p>Positions: {positions.length}</p>
 *       <button onClick={() => addLiquidity(params)} disabled={isAdding}>
 *         Add Liquidity
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Address,
  HfheKeyPair,
  PoolId,
  PositionId,
  LiquidityPosition,
  LiquidityResult,
  AddLiquidityParams,
  RemoveLiquidityParams,
  TransactionReceipt,
  EncryptedU64,
} from '../core/types.js';
import type { TransactionBuilder } from '../core/ocs01.js';
import { PairClient } from '../clients/pair.js';
import { decryptValue } from '../core/hfhe.js';

export interface PositionSummary {
  readonly position: LiquidityPosition;
  readonly liquidityDecrypted: bigint;
  readonly tokensOwed0Decrypted: bigint;
  readonly tokensOwed1Decrypted: bigint;
  readonly inRange: boolean;
}

export interface UseLiquidityOptions {
  /** Auto-refresh positions interval in ms (0 = disabled, default: 30000) */
  refreshInterval?: number;
  /** Callback on successful liquidity operation */
  onSuccess?: (result: LiquidityResult | TransactionReceipt) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseLiquidityResult {
  /** All positions for the connected wallet with decrypted values */
  readonly positions: readonly PositionSummary[];
  /** Whether positions are loading */
  readonly isLoading: boolean;
  /** Whether an add liquidity tx is pending */
  readonly isAdding: boolean;
  /** Whether a remove liquidity tx is pending */
  readonly isRemoving: boolean;
  /** Whether a fee collection tx is pending */
  readonly isCollecting: boolean;
  /** Last error */
  readonly error: Error | null;
  /** Add liquidity to create a new position */
  readonly addLiquidity: (params: AddLiquidityParams) => Promise<LiquidityResult | null>;
  /** Remove liquidity from a position */
  readonly removeLiquidity: (params: RemoveLiquidityParams) => Promise<LiquidityResult | null>;
  /** Remove all liquidity from a position */
  readonly removeAllLiquidity: (positionId: PositionId, deadline: bigint) => Promise<LiquidityResult | null>;
  /** Collect accumulated fees from a position */
  readonly collectFees: (positionId: PositionId) => Promise<TransactionReceipt | null>;
  /** Collect fees from all positions */
  readonly collectAllFees: () => Promise<TransactionReceipt[]>;
  /** Add full-range liquidity (CPAMM style) */
  readonly addFullRange: (
    amount0: bigint, amount1: bigint, tickSpacing: number, deadline: bigint
  ) => Promise<LiquidityResult | null>;
  /** Refresh position data */
  readonly refresh: () => Promise<void>;
}

/**
 * Hook for managing liquidity positions.
 */
export function useLiquidity(
  txBuilder: TransactionBuilder | null,
  keyPair: HfheKeyPair | null,
  poolAddress: Address | null,
  options: UseLiquidityOptions = {}
): UseLiquidityResult {
  const { refreshInterval = 30000, onSuccess, onError } = options;

  const [positions, setPositions] = useState<readonly PositionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<PairClient | null>(null);

  // Create client
  useEffect(() => {
    if (poolAddress && txBuilder && keyPair) {
      clientRef.current = new PairClient(txBuilder, keyPair, poolAddress);
    } else {
      clientRef.current = null;
    }
  }, [poolAddress, txBuilder, keyPair]);

  // Fetch and decrypt positions
  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !keyPair) return;

    setIsLoading(true);
    try {
      const summary = await client.getPositionSummary();
      setPositions(summary.map(s => ({
        position: s.position,
        liquidityDecrypted: s.liquidity,
        tokensOwed0Decrypted: s.tokensOwed0,
        tokensOwed1Decrypted: s.tokensOwed1,
        inRange: s.inRange,
      })));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [keyPair]);

  // Auto-refresh
  useEffect(() => {
    if (!clientRef.current) return;
    refresh();
    if (refreshInterval > 0) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refresh, refreshInterval, poolAddress]);

  // Add liquidity
  const addLiquidity = useCallback(async (params: AddLiquidityParams): Promise<LiquidityResult | null> => {
    const client = clientRef.current;
    if (!client) return null;

    setIsAdding(true);
    setError(null);
    try {
      const result = await client.addLiquidity(params);
      onSuccess?.(result);
      await refresh();
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
      return null;
    } finally {
      setIsAdding(false);
    }
  }, [refresh, onSuccess, onError]);

  // Remove liquidity
  const removeLiquidity = useCallback(async (params: RemoveLiquidityParams): Promise<LiquidityResult | null> => {
    const client = clientRef.current;
    if (!client) return null;

    setIsRemoving(true);
    setError(null);
    try {
      const result = await client.removeLiquidity(params);
      onSuccess?.(result);
      await refresh();
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
      return null;
    } finally {
      setIsRemoving(false);
    }
  }, [refresh, onSuccess, onError]);

  // Remove all liquidity from a position
  const removeAllLiquidity = useCallback(async (
    positionId: PositionId, deadline: bigint
  ): Promise<LiquidityResult | null> => {
    const pos = positions.find(p => p.position.positionId === positionId);
    if (!pos) return null;

    return removeLiquidity({
      positionId,
      liquidityAmount: pos.liquidityDecrypted,
      amount0Min: 0n,
      amount1Min: 0n,
      deadline,
    });
  }, [positions, removeLiquidity]);

  // Collect fees
  const collectFees = useCallback(async (positionId: PositionId): Promise<TransactionReceipt | null> => {
    const client = clientRef.current;
    if (!client) return null;

    setIsCollecting(true);
    setError(null);
    try {
      const receipt = await client.collectFees(positionId);
      onSuccess?.(receipt);
      await refresh();
      return receipt;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
      return null;
    } finally {
      setIsCollecting(false);
    }
  }, [refresh, onSuccess, onError]);

  // Collect all fees
  const collectAllFees = useCallback(async (): Promise<TransactionReceipt[]> => {
    const client = clientRef.current;
    if (!client) return [];

    const receipts: TransactionReceipt[] = [];
    for (const pos of positions) {
      if (pos.tokensOwed0Decrypted > 0n || pos.tokensOwed1Decrypted > 0n) {
        const receipt = await collectFees(pos.position.positionId);
        if (receipt) receipts.push(receipt);
      }
    }
    return receipts;
  }, [positions, collectFees]);

  // Add full-range liquidity
  const addFullRange = useCallback(async (
    amount0: bigint, amount1: bigint, tickSpacing: number, deadline: bigint
  ): Promise<LiquidityResult | null> => {
    const client = clientRef.current;
    if (!client || !txBuilder) return null;

    setIsAdding(true);
    setError(null);
    try {
      const signer = txBuilder.getSignerAddress();
      const result = await client.addFullRangeLiquidity(
        amount0, amount1, tickSpacing, signer, deadline
      );
      onSuccess?.(result);
      await refresh();
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
      return null;
    } finally {
      setIsAdding(false);
    }
  }, [txBuilder, refresh, onSuccess, onError]);

  return {
    positions,
    isLoading,
    isAdding,
    isRemoving,
    isCollecting,
    error,
    addLiquidity,
    removeLiquidity,
    removeAllLiquidity,
    collectFees,
    collectAllFees,
    addFullRange,
    refresh,
  };
}

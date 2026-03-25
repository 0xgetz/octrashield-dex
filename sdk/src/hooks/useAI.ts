/**
 * useAI — AI Engine Data Hook
 *
 * Provides reactive access to AI-computed dynamic fees, MEV detection,
 * volatility metrics, rebalancing suggestions, and risk assessments.
 *
 * Usage:
 * ```tsx
 * function AIPanel({ poolId }: { poolId: PoolId }) {
 *   const { dynamicFee, mevAlerts, isSafe, volatility } = useAI(
 *     txBuilder, keyPair, aiAddress, poolId
 *   );
 *
 *   return (
 *     <div>
 *       <p>Safe to trade: {isSafe ? 'Yes' : 'No'}</p>
 *       <p>MEV Alerts: {mevAlerts.length}</p>
 *       <p>Fee multiplier: {dynamicFee?.multiplierBps}bps</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Address,
  PoolId,
  PositionId,
  HfheKeyPair,
  DynamicFee,
  VolatilityData,
  MevAlert,
  RebalanceSuggestion,
} from '../core/types.js';
import type { TransactionBuilder } from '../core/ocs01.js';
import { AIEngineClient, type AIHealthStatus, type PoolRiskAssessment } from '../clients/ai-engine.js';

export interface UseAIOptions {
  /** Auto-refresh interval in ms (0 = disabled, default: 10000) */
  refreshInterval?: number;
  /** Fetch rebalancing suggestions for these position IDs */
  positionIds?: readonly PositionId[];
  /** Enable MEV protection monitoring */
  enableMevMonitoring?: boolean;
}

export interface UseAIResult {
  /** AI-adjusted dynamic fee for the pool */
  readonly dynamicFee: DynamicFee | null;
  /** Decrypted fee values */
  readonly decryptedFee: { baseFee: bigint; adjustedFee: bigint } | null;
  /** Encrypted volatility data */
  readonly volatility: VolatilityData | null;
  /** Decrypted volatility metrics */
  readonly decryptedVolatility: {
    emaVolatility: bigint;
    shortTermVol: bigint;
    longTermVol: bigint;
    volRatio: bigint;
  } | null;
  /** Active MEV detection alerts */
  readonly mevAlerts: readonly MevAlert[];
  /** Pool risk assessment */
  readonly risk: PoolRiskAssessment | null;
  /** Whether the pool is currently safe to trade */
  readonly isSafe: boolean;
  /** Safety reason explanation */
  readonly safetyReason: string;
  /** Rebalancing suggestions for tracked positions */
  readonly rebalanceSuggestions: readonly RebalanceSuggestion[];
  /** AI engine health status */
  readonly health: AIHealthStatus | null;
  /** Whether data is loading */
  readonly isLoading: boolean;
  /** Last error */
  readonly error: Error | null;
  /** Manually trigger a refresh */
  readonly refresh: () => Promise<void>;
  /** Request an immediate fee recalculation */
  readonly requestFeeUpdate: () => Promise<void>;
  /** Report suspected MEV activity */
  readonly reportMev: (txHashes: string[], evidence: string) => Promise<void>;
}

/**
 * Hook for AI engine data: fees, MEV, volatility, and rebalancing.
 */
export function useAI(
  txBuilder: TransactionBuilder | null,
  keyPair: HfheKeyPair | null,
  aiAddress: Address | null,
  poolId: PoolId | null,
  options: UseAIOptions = {}
): UseAIResult {
  const {
    refreshInterval = 10000,
    positionIds = [],
    enableMevMonitoring = true,
  } = options;

  const [dynamicFee, setDynamicFee] = useState<DynamicFee | null>(null);
  const [decryptedFee, setDecryptedFee] = useState<{ baseFee: bigint; adjustedFee: bigint } | null>(null);
  const [volatility, setVolatility] = useState<VolatilityData | null>(null);
  const [decryptedVolatility, setDecryptedVolatility] = useState<{
    emaVolatility: bigint; shortTermVol: bigint; longTermVol: bigint; volRatio: bigint;
  } | null>(null);
  const [mevAlerts, setMevAlerts] = useState<readonly MevAlert[]>([]);
  const [risk, setRisk] = useState<PoolRiskAssessment | null>(null);
  const [isSafe, setIsSafe] = useState(true);
  const [safetyReason, setSafetyReason] = useState('Checking...');
  const [rebalanceSuggestions, setRebalanceSuggestions] = useState<readonly RebalanceSuggestion[]>([]);
  const [health, setHealth] = useState<AIHealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<AIEngineClient | null>(null);

  // Create client
  useEffect(() => {
    if (aiAddress && txBuilder && keyPair) {
      clientRef.current = new AIEngineClient(txBuilder, keyPair, aiAddress);
    } else {
      clientRef.current = null;
    }
  }, [aiAddress, txBuilder, keyPair]);

  // Fetch all AI data
  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !poolId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const promises: Promise<unknown>[] = [
        client.getDynamicFee(poolId),
        client.getVolatility(poolId),
        client.getPoolRisk(poolId),
        client.getHealthStatus(),
      ];

      if (enableMevMonitoring) {
        promises.push(client.getMevAlerts(poolId));
      }

      const results = await Promise.allSettled(promises);

      // Dynamic fee
      if (results[0].status === 'fulfilled') {
        const fee = results[0].value as DynamicFee;
        setDynamicFee(fee);
        try {
          setDecryptedFee(client.decryptFee(fee));
        } catch { setDecryptedFee(null); }
      }

      // Volatility
      if (results[1].status === 'fulfilled') {
        const vol = results[1].value as VolatilityData;
        setVolatility(vol);
        try {
          setDecryptedVolatility(client.decryptVolatility(vol));
        } catch { setDecryptedVolatility(null); }
      }

      // Risk
      if (results[2].status === 'fulfilled') {
        setRisk(results[2].value as PoolRiskAssessment);
      }

      // Health
      if (results[3].status === 'fulfilled') {
        setHealth(results[3].value as AIHealthStatus);
      }

      // MEV alerts
      if (enableMevMonitoring && results[4]?.status === 'fulfilled') {
        setMevAlerts(results[4].value as MevAlert[]);
      }

      // Compute safety
      const safetyCheck = await client.isPoolSafe(poolId);
      setIsSafe(safetyCheck.safe);
      setSafetyReason(safetyCheck.reason);

      // Rebalancing suggestions
      if (positionIds.length > 0) {
        const allSuggestions: RebalanceSuggestion[] = [];
        for (const posId of positionIds) {
          try {
            const suggestions = await client.getRebalanceSuggestions(posId);
            allSuggestions.push(...suggestions);
          } catch { /* skip failed positions */ }
        }
        setRebalanceSuggestions(allSuggestions);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [poolId, enableMevMonitoring, positionIds]);

  // Auto-refresh
  useEffect(() => {
    if (!clientRef.current || !poolId) return;
    refresh();
    if (refreshInterval > 0) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refresh, refreshInterval, poolId]);

  // Request fee update
  const requestFeeUpdate = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !poolId) return;
    try {
      await client.requestFeeUpdate(poolId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [poolId, refresh]);

  // Report MEV
  const reportMev = useCallback(async (txHashes: string[], evidence: string) => {
    const client = clientRef.current;
    if (!client || !poolId) return;
    try {
      await client.reportMevSuspicion(poolId, txHashes, evidence);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [poolId, refresh]);

  return {
    dynamicFee,
    decryptedFee,
    volatility,
    decryptedVolatility,
    mevAlerts,
    risk,
    isSafe,
    safetyReason,
    rebalanceSuggestions,
    health,
    isLoading,
    error,
    refresh,
    requestFeeUpdate,
    reportMev,
  };
}

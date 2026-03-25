/**
 * useSwap — Swap Execution Hook with Encrypted Parameters
 *
 * Manages the complete swap lifecycle: route finding, quoting,
 * approval checking, execution, and result decryption.
 *
 * Usage:
 * ```tsx
 * function SwapPanel() {
 *   const { quote, execute, isQuoting, isSwapping, result } = useSwap(
 *     txBuilder, keyPair, routerAddress
 *   );
 *
 *   const handleSwap = async () => {
 *     const q = await quote(tokenIn, tokenOut, amountIn, route);
 *     if (q) await execute();
 *   };
 *
 *   return (
 *     <div>
 *       {isQuoting && <p>Getting quote...</p>}
 *       {result && <p>Swapped! TX: {result.txReceipt.txHash}</p>}
 *       <button onClick={handleSwap} disabled={isSwapping}>Swap</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import type {
  Address,
  HfheKeyPair,
  SwapRoute,
  SwapQuote,
  SwapResult,
  ExactInputParams,
  DarkPoolSwapParams,
  TransactionReceipt,
} from '../core/types.js';
import type { TransactionBuilder } from '../core/ocs01.js';
import { RouterClient } from '../clients/router.js';
import { decryptValue } from '../core/hfhe.js';
import { DEFAULT_SLIPPAGE_BPS } from '../core/constants.js';
import { calculateMinOutput } from '../utils/math.js';

export interface UseSwapOptions {
  /** Default slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageBps?: number;
  /** Auto-approve tokens before swap */
  autoApprove?: boolean;
  /** Callback on successful swap */
  onSuccess?: (result: SwapResult) => void;
  /** Callback on swap error */
  onError?: (error: Error) => void;
}

export interface UseSwapResult {
  /** Current swap quote */
  readonly currentQuote: SwapQuote | null;
  /** Last swap result */
  readonly result: SwapResult | null;
  /** Decrypted output amount from last swap */
  readonly decryptedOutput: bigint | null;
  /** Whether a quote is being fetched */
  readonly isQuoting: boolean;
  /** Whether a swap is being executed */
  readonly isSwapping: boolean;
  /** Last error */
  readonly error: Error | null;
  /** Get a quote for an exact-input swap */
  readonly quote: (
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    route: SwapRoute
  ) => Promise<SwapQuote | null>;
  /** Execute the current quote */
  readonly execute: () => Promise<SwapResult | null>;
  /** Execute a dark pool swap (fully encrypted) */
  readonly darkPoolSwap: (params: DarkPoolSwapParams) => Promise<TransactionReceipt | null>;
  /** Build dark pool params from plaintext values */
  readonly buildDarkPoolParams: (
    poolIndex: bigint,
    zeroForOne: boolean,
    amount: bigint,
    minOutput: bigint,
    recipient: bigint,
    deadline: bigint
  ) => DarkPoolSwapParams;
  /** Reset state */
  readonly reset: () => void;
}

/**
 * Hook for executing encrypted swaps.
 */
export function useSwap(
  txBuilder: TransactionBuilder | null,
  keyPair: HfheKeyPair | null,
  routerAddress: Address | null,
  options: UseSwapOptions = {}
): UseSwapResult {
  const {
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    onSuccess,
    onError,
  } = options;

  const [currentQuote, setCurrentQuote] = useState<SwapQuote | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [decryptedOutput, setDecryptedOutput] = useState<bigint | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<RouterClient | null>(null);

  // Lazily create client
  const getClient = useCallback((): RouterClient | null => {
    if (!txBuilder || !keyPair || !routerAddress) return null;
    if (!clientRef.current) {
      clientRef.current = new RouterClient(txBuilder, keyPair, routerAddress);
    }
    return clientRef.current;
  }, [txBuilder, keyPair, routerAddress]);

  /**
   * Get a swap quote.
   */
  const quote = useCallback(async (
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    route: SwapRoute
  ): Promise<SwapQuote | null> => {
    const client = getClient();
    if (!client) return null;

    setIsQuoting(true);
    setError(null);

    try {
      const q = await client.quoteExactInput(route, amountIn);
      setCurrentQuote(q);
      return q;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
      return null;
    } finally {
      setIsQuoting(false);
    }
  }, [getClient, onError]);

  /**
   * Execute the current quote.
   */
  const execute = useCallback(async (): Promise<SwapResult | null> => {
    const client = getClient();
    if (!client || !currentQuote || !txBuilder) return null;

    setIsSwapping(true);
    setError(null);

    try {
      const minOutput = calculateMinOutput(currentQuote.expectedAmountOut, slippageBps);
      const signer = txBuilder.getSignerAddress();

      const swapResult = await client.swapExactInput({
        route: currentQuote.route,
        amountIn: currentQuote.amountIn,
        amountOutMinimum: minOutput,
        recipient: signer,
        deadline: currentQuote.deadline,
      });

      setResult(swapResult);

      // Decrypt output if possible
      if (keyPair) {
        try {
          const output = decryptValue(swapResult.amountOut, keyPair);
          setDecryptedOutput(output);
        } catch {
          setDecryptedOutput(null);
        }
      }

      onSuccess?.(swapResult);
      return swapResult;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
      return null;
    } finally {
      setIsSwapping(false);
    }
  }, [getClient, currentQuote, txBuilder, keyPair, slippageBps, onSuccess, onError]);

  /**
   * Execute a dark pool swap.
   */
  const darkPoolSwap = useCallback(async (
    params: DarkPoolSwapParams
  ): Promise<TransactionReceipt | null> => {
    const client = getClient();
    if (!client) return null;

    setIsSwapping(true);
    setError(null);

    try {
      const receipt = await client.darkPoolSwap(params);
      return receipt;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
      return null;
    } finally {
      setIsSwapping(false);
    }
  }, [getClient, onError]);

  /**
   * Build dark pool params from plaintext.
   */
  const buildDarkPoolParams = useCallback((
    poolIndex: bigint,
    zeroForOne: boolean,
    amount: bigint,
    minOutput: bigint,
    recipient: bigint,
    deadline: bigint
  ): DarkPoolSwapParams => {
    const client = getClient();
    if (!client) throw new Error('Router client not initialized');
    return client.buildDarkPoolParams(poolIndex, zeroForOne, amount, minOutput, recipient, deadline);
  }, [getClient]);

  /**
   * Reset all state.
   */
  const reset = useCallback(() => {
    setCurrentQuote(null);
    setResult(null);
    setDecryptedOutput(null);
    setError(null);
  }, []);

  return {
    currentQuote,
    result,
    decryptedOutput,
    isQuoting,
    isSwapping,
    error,
    quote,
    execute,
    darkPoolSwap,
    buildDarkPoolParams,
    reset,
  };
}

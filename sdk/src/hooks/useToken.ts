/**
 * useToken — Encrypted ERC20 Token Hook
 *
 * Manages encrypted token balances, approvals, and transfers.
 * Automatically decrypts balances for the connected wallet.
 *
 * Usage:
 * ```tsx
 * function TokenBalance({ tokenAddress }: { tokenAddress: Address }) {
 *   const { balance, symbol, transfer, approve } = useToken(
 *     txBuilder, keyPair, tokenAddress
 *   );
 *
 *   return (
 *     <div>
 *       <p>{balance?.plaintext.toString()} {symbol}</p>
 *       <button onClick={() => transfer(recipient, 100n)}>Send 100</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Address,
  HfheKeyPair,
  EncryptedU64,
  TokenInfo,
  TransactionReceipt,
} from '../core/types.js';
import type { TransactionBuilder } from '../core/ocs01.js';
import { ShieldTokenClient } from '../clients/shield-token.js';

export interface TokenBalanceInfo {
  readonly encrypted: EncryptedU64;
  readonly plaintext: bigint;
}

export interface UseTokenOptions {
  /** Auto-refresh balance interval in ms (0 = disabled, default: 15000) */
  refreshInterval?: number;
  /** Spender address to track allowance for */
  spender?: Address;
  /** Callback on successful transaction */
  onSuccess?: (receipt: TransactionReceipt) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseTokenResult {
  /** Token metadata */
  readonly info: TokenInfo | null;
  /** Token name */
  readonly name: string | null;
  /** Token symbol */
  readonly symbol: string | null;
  /** Token decimals */
  readonly decimals: number | null;
  /** Connected wallet's balance (encrypted + decrypted) */
  readonly balance: TokenBalanceInfo | null;
  /** Current allowance for the specified spender */
  readonly allowance: bigint | null;
  /** Whether data is loading */
  readonly isLoading: boolean;
  /** Whether a transaction is pending */
  readonly isPending: boolean;
  /** Last error */
  readonly error: Error | null;
  /** Transfer tokens to a recipient */
  readonly transfer: (to: Address, amount: bigint) => Promise<TransactionReceipt | null>;
  /** Approve a spender */
  readonly approve: (spender: Address, amount: bigint) => Promise<TransactionReceipt | null>;
  /** Approve unlimited spending */
  readonly approveMax: (spender: Address) => Promise<TransactionReceipt | null>;
  /** Ensure spender has sufficient allowance (approves if needed) */
  readonly ensureAllowance: (spender: Address, amount: bigint) => Promise<boolean>;
  /** Transfer from another address (requires allowance) */
  readonly transferFrom: (from: Address, to: Address, amount: bigint) => Promise<TransactionReceipt | null>;
  /** Refresh balance and allowance */
  readonly refresh: () => Promise<void>;
}

/**
 * Hook for encrypted ERC20 token operations.
 */
export function useToken(
  txBuilder: TransactionBuilder | null,
  keyPair: HfheKeyPair | null,
  tokenAddress: Address | null,
  options: UseTokenOptions = {}
): UseTokenResult {
  const { refreshInterval = 15000, spender, onSuccess, onError } = options;

  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [balance, setBalance] = useState<TokenBalanceInfo | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<ShieldTokenClient | null>(null);

  // Create client
  useEffect(() => {
    if (tokenAddress && txBuilder && keyPair) {
      clientRef.current = new ShieldTokenClient(txBuilder, keyPair, tokenAddress);
    } else {
      clientRef.current = null;
    }
  }, [tokenAddress, txBuilder, keyPair]);

  // Fetch token data
  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    setIsLoading(true);
    try {
      // Fetch info and balance in parallel
      const [tokenInfo, myBalance] = await Promise.all([
        info ? Promise.resolve(info) : client.getTokenInfo(),
        client.getMyBalance(),
      ]);

      setInfo(tokenInfo);
      setBalance({ encrypted: myBalance.encrypted, plaintext: myBalance.plaintext });

      // Fetch allowance if spender specified
      if (spender && txBuilder) {
        const signer = txBuilder.getSignerAddress();
        const allowanceData = await client.getAllowance(signer, spender);
        const decrypted = client.decryptAllowance(allowanceData);
        setAllowance(decrypted);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [info, spender, txBuilder]);

  // Auto-refresh
  useEffect(() => {
    if (!clientRef.current) return;
    refresh();
    if (refreshInterval > 0) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refresh, refreshInterval, tokenAddress]);

  // Helper for executing token transactions
  const execTx = useCallback(async (
    fn: () => Promise<TransactionReceipt>
  ): Promise<TransactionReceipt | null> => {
    setIsPending(true);
    setError(null);
    try {
      const receipt = await fn();
      onSuccess?.(receipt);
      await refresh();
      return receipt;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(e);
      return null;
    } finally {
      setIsPending(false);
    }
  }, [refresh, onSuccess, onError]);

  const transfer = useCallback(async (to: Address, amount: bigint) => {
    const client = clientRef.current;
    if (!client) return null;
    return execTx(() => client.transfer(to, amount));
  }, [execTx]);

  const approve = useCallback(async (spenderAddr: Address, amount: bigint) => {
    const client = clientRef.current;
    if (!client) return null;
    return execTx(() => client.approve(spenderAddr, amount));
  }, [execTx]);

  const approveMax = useCallback(async (spenderAddr: Address) => {
    const client = clientRef.current;
    if (!client) return null;
    return execTx(() => client.approveMax(spenderAddr));
  }, [execTx]);

  const ensureAllowance = useCallback(async (spenderAddr: Address, amount: bigint): Promise<boolean> => {
    const client = clientRef.current;
    if (!client) return false;
    try {
      const result = await client.ensureAllowance(spenderAddr, amount);
      if (result.approved) await refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  const transferFrom = useCallback(async (from: Address, to: Address, amount: bigint) => {
    const client = clientRef.current;
    if (!client) return null;
    return execTx(() => client.transferFrom(from, to, amount));
  }, [execTx]);

  return {
    info,
    name: info?.name || null,
    symbol: info?.symbol || null,
    decimals: info?.decimals || null,
    balance,
    allowance,
    isLoading,
    isPending,
    error,
    transfer,
    approve,
    approveMax,
    ensureAllowance,
    transferFrom,
    refresh,
  };
}

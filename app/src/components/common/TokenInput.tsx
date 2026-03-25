/**
 * TokenInput — Amount input field with token selector, balance, and MAX button.
 * Core input component used in Swap, AddLiquidity, and Transfer flows.
 */

import { useCallback, type ChangeEvent } from 'react';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { TokenIcon } from './TokenIcon.js';
import { getTokenMeta } from '@/config/tokens.js';

export interface TokenInputProps {
  /** Token address */
  token: Address | null;
  /** Amount value (string for precision) */
  amount: string;
  /** Called when amount changes */
  onAmountChange: (value: string) => void;
  /** Called when user clicks the token selector */
  onTokenSelect?: () => void;
  /** Decrypted balance for display */
  balance?: string | null;
  /** USD value estimate */
  usdValue?: string | null;
  /** Label above the input (e.g., "You pay", "You receive") */
  label?: string;
  /** Whether this is the output (read-only) side */
  readOnly?: boolean;
  /** Whether the balance is still loading/decrypting */
  balanceLoading?: boolean;
  /** Disable interaction */
  disabled?: boolean;
  /** Additional class */
  className?: string;
}

export function TokenInput({
  token,
  amount,
  onAmountChange,
  onTokenSelect,
  balance,
  usdValue,
  label,
  readOnly = false,
  balanceLoading = false,
  disabled = false,
  className,
}: TokenInputProps) {
  const meta = token ? getTokenMeta(token) : null;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      // Allow only valid decimal input
      if (val === '' || /^\d*\.?\d*$/.test(val)) {
        onAmountChange(val);
      }
    },
    [onAmountChange]
  );

  const handleMax = useCallback(() => {
    if (balance) onAmountChange(balance);
  }, [balance, onAmountChange]);

  return (
    <div
      className={clsx(
        'rounded-2xl border border-surface-500/20 bg-surface-800/40 p-4',
        'transition-colors duration-200',
        'focus-within:border-octra-500/40 focus-within:bg-surface-800/60',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      {/* Top row: label + balance */}
      <div className="flex items-center justify-between mb-2">
        {label && (
          <span className="text-xs font-medium text-surface-400">{label}</span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {balanceLoading ? (
            <div className="shimmer w-16 h-3" />
          ) : balance !== undefined && balance !== null ? (
            <>
              <span className="text-xs text-surface-400">Balance:</span>
              <span className="text-xs font-mono text-surface-300">{balance}</span>
              {!readOnly && (
                <button
                  onClick={handleMax}
                  className="text-2xs font-semibold text-octra-400 hover:text-octra-300 uppercase ml-1 transition-colors"
                >
                  MAX
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Main row: amount input + token selector */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={handleChange}
          readOnly={readOnly}
          disabled={disabled}
          className={clsx(
            'flex-1 bg-transparent text-2xl font-semibold text-surface-50',
            'placeholder:text-surface-500 outline-none',
            'font-mono tracking-tight min-w-0',
            readOnly && 'cursor-default'
          )}
        />

        <button
          onClick={onTokenSelect}
          disabled={!onTokenSelect}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-xl',
            'bg-surface-700/60 border border-surface-500/20',
            'hover:bg-surface-600/60 hover:border-surface-500/40',
            'transition-all duration-200 shrink-0',
            !onTokenSelect && 'cursor-default'
          )}
        >
          {token && meta ? (
            <>
              <TokenIcon address={token} size={22} />
              <span className="font-semibold text-sm text-surface-50">{meta.symbol}</span>
            </>
          ) : (
            <span className="font-medium text-sm text-surface-300">Select token</span>
          )}
          {onTokenSelect && (
            <svg className="w-3.5 h-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* Bottom row: USD estimate */}
      {usdValue && (
        <div className="mt-1.5">
          <span className="text-xs text-surface-400 font-mono">${usdValue}</span>
        </div>
      )}
    </div>
  );
}

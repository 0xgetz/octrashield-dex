/**
 * TokenInput — Amount input with token selector, balance, and MAX button.
 */

import { useCallback, type ChangeEvent } from 'react';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { TokenIcon } from './TokenIcon.js';
import { getTokenMeta, KNOWN_TOKENS } from '@/config/tokens.js';

export interface TokenInputProps {
  token: Address | string | null;
  amount?: string;
  value?: string;
  onAmountChange?: (value: string) => void;
  onChange?: (value: string) => void;
  onTokenSelect?: () => void;
  balance?: string | null;
  usdValue?: string | null;
  label?: string;
  readOnly?: boolean;
  balanceLoading?: boolean;
  disabled?: boolean;
  showMax?: boolean;
  className?: string;
}

function isAddress(value: string): boolean {
  return value.startsWith('0x') || value.startsWith('oct');
}

export function TokenInput({
  token,
  amount,
  value,
  onAmountChange,
  onChange,
  onTokenSelect,
  balance,
  usdValue,
  label,
  readOnly = false,
  balanceLoading = false,
  disabled = false,
  showMax = true,
  className,
}: TokenInputProps) {
  const currentAmount = amount ?? value ?? '';
  const changeAmount = onAmountChange ?? onChange ?? (() => undefined);
  const tokenString = token ?? '';
  const meta = tokenString
    ? isAddress(tokenString)
      ? getTokenMeta(tokenString as Address)
      : KNOWN_TOKENS.find((item) => item.symbol === tokenString)
    : null;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      if (nextValue === '' || /^\d*\.?\d*$/.test(nextValue)) {
        changeAmount(nextValue);
      }
    },
    [changeAmount]
  );

  const handleMax = useCallback(() => {
    if (balance) changeAmount(balance);
  }, [balance, changeAmount]);

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
      <div className="flex items-center justify-between mb-2">
        {label && <span className="text-xs font-medium text-surface-400">{label}</span>}
        <div className="flex items-center gap-1.5 ml-auto">
          {balanceLoading ? (
            <div className="shimmer w-16 h-3" />
          ) : balance !== undefined && balance !== null ? (
            <>
              <span className="text-xs text-surface-400">Balance:</span>
              <span className="text-xs font-mono text-surface-300">{balance}</span>
              {!readOnly && showMax && (
                <button
                  type="button"
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

      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={currentAmount}
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
          type="button"
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
          {tokenString && meta ? (
            <>
              <TokenIcon
                {...(isAddress(tokenString)
                  ? { address: tokenString as Address }
                  : { symbol: tokenString })}
                size={22}
              />
              <span className="font-semibold text-sm text-surface-50">{meta.symbol}</span>
            </>
          ) : tokenString ? (
            <span className="font-semibold text-sm text-surface-50">{tokenString}</span>
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

      {usdValue && (
        <div className="mt-1.5">
          <span className="text-xs text-surface-400 font-mono">${usdValue}</span>
        </div>
      )}
    </div>
  );
}

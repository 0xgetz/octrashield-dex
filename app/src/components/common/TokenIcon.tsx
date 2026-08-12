/**
 * TokenIcon — Token logo with gradient fallback.
 * Displays a token logo from the known token list, or a deterministic
 * fallback for an address/symbol that is not registered yet.
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { getTokenMeta, KNOWN_TOKENS } from '@/config/tokens.js';

export interface TokenIconProps {
  address?: Address;
  symbol?: string;
  size?: number;
  className?: string;
}

function isAddress(value: string): boolean {
  return value.startsWith('0x') || value.startsWith('oct');
}

function resolveMeta(address?: Address, symbol?: string) {
  if (address) return getTokenMeta(address);
  if (symbol) return KNOWN_TOKENS.find((token) => token.symbol === symbol);
  return undefined;
}

export function TokenIcon({ address, symbol, size = 28, className }: TokenIconProps) {
  const [imgError, setImgError] = useState(false);
  const meta = resolveMeta(address, symbol);
  const resolvedSymbol = meta?.symbol ?? symbol ?? (address ? `${address.slice(0, 4)}…` : '?');
  const color = meta?.color ?? '#5a6a8a';

  if (meta?.logoUrl && !imgError) {
    return (
      <img
        src={meta.logoUrl}
        alt={resolvedSymbol}
        width={size}
        height={size}
        className={clsx('rounded-full', className)}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={resolvedSymbol}
      className={clsx(
        'rounded-full flex items-center justify-center font-semibold text-white',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, ${color}, ${color}88)`,
      }}
    >
      {resolvedSymbol[0] ?? '?'}
    </div>
  );
}

/** Token pair icon — overlapping two tokens. */
export function TokenPairIcon({
  token0,
  token1,
  size = 28,
  className,
}: {
  token0: Address | string;
  token1: Address | string;
  size?: number;
  className?: string;
}) {
  const iconProps = (token: Address | string): TokenIconProps =>
    isAddress(token) ? { address: token as Address, size } : { symbol: token, size };

  return (
    <div className={clsx('flex items-center', className)} style={{ width: size * 1.6 }}>
      <TokenIcon {...iconProps(token0)} />
      <div className="-ml-2 ring-2 ring-surface-800 rounded-full">
        <TokenIcon {...iconProps(token1)} />
      </div>
    </div>
  );
}

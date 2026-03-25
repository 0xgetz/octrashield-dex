/**
 * TokenIcon — Token logo with gradient fallback.
 * Displays the token logo from the known token list,
 * or a colored circle with the first letter of the symbol.
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { getTokenMeta } from '@/config/tokens.js';

export interface TokenIconProps {
  address: Address;
  size?: number;
  className?: string;
}

export function TokenIcon({ address, size = 28, className }: TokenIconProps) {
  const [imgError, setImgError] = useState(false);
  const meta = getTokenMeta(address);
  const symbol = meta?.symbol ?? '?';
  const color = meta?.color ?? '#5a6a8a';

  if (meta?.logoUrl && !imgError) {
    return (
      <img
        src={meta.logoUrl}
        alt={symbol}
        width={size}
        height={size}
        className={clsx('rounded-full', className)}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: colored circle with letter
  return (
    <div
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
      {symbol[0]}
    </div>
  );
}

/** Token pair icon — overlapping two tokens */
export function TokenPairIcon({
  token0,
  token1,
  size = 28,
  className,
}: {
  token0: Address;
  token1: Address;
  size?: number;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-center', className)} style={{ width: size * 1.6 }}>
      <TokenIcon address={token0} size={size} />
      <div className="-ml-2 ring-2 ring-surface-800 rounded-full">
        <TokenIcon address={token1} size={size} />
      </div>
    </div>
  );
}

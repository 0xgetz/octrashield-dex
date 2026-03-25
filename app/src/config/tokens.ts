/**
 * Known Token Registry — Metadata for display in the UI.
 *
 * Token addresses are placeholders (testnet). The SDK resolves
 * on-chain metadata; this list provides icons, display names,
 * and color accents for known tokens.
 */

import type { Address } from '@octrashield/dex-sdk';

export interface TokenMeta {
  readonly address: Address;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoUrl: string;
  readonly color: string;
  readonly isNative?: boolean;
  readonly isStable?: boolean;
}

/**
 * Placeholder addresses — replaced with real deployment addresses.
 * Using deterministic patterns for development.
 */
const addr = (suffix: string): Address =>
  `0x${'0'.repeat(64 - suffix.length)}${suffix}` as Address;

export const KNOWN_TOKENS: readonly TokenMeta[] = [
  {
    address: addr('01'),
    symbol: 'OCTA',
    name: 'Octra Native Token',
    decimals: 18,
    logoUrl: '/tokens/octa.svg',
    color: '#28a3ff',
    isNative: true,
  },
  {
    address: addr('02'),
    symbol: 'sUSD',
    name: 'Shield USD',
    decimals: 6,
    logoUrl: '/tokens/susd.svg',
    color: '#22c55e',
    isStable: true,
  },
  {
    address: addr('03'),
    symbol: 'sETH',
    name: 'Shield Ether',
    decimals: 18,
    logoUrl: '/tokens/seth.svg',
    color: '#627eea',
  },
  {
    address: addr('04'),
    symbol: 'sBTC',
    name: 'Shield Bitcoin',
    decimals: 8,
    logoUrl: '/tokens/sbtc.svg',
    color: '#f7931a',
  },
  {
    address: addr('05'),
    symbol: 'sDAI',
    name: 'Shield DAI',
    decimals: 18,
    logoUrl: '/tokens/sdai.svg',
    color: '#f5ac37',
    isStable: true,
  },
  {
    address: addr('06'),
    symbol: 'PRIV',
    name: 'Privacy Token',
    decimals: 18,
    logoUrl: '/tokens/priv.svg',
    color: '#843dff',
  },
  {
    address: addr('07'),
    symbol: 'sLINK',
    name: 'Shield Chainlink',
    decimals: 18,
    logoUrl: '/tokens/slink.svg',
    color: '#375bd2',
  },
  {
    address: addr('08'),
    symbol: 'sSOL',
    name: 'Shield Solana',
    decimals: 9,
    logoUrl: '/tokens/ssol.svg',
    color: '#9945ff',
  },
] as const;

/** Lookup token metadata by address */
export function getTokenMeta(address: Address): TokenMeta | undefined {
  return KNOWN_TOKENS.find(
    (t) => t.address.toLowerCase() === address.toLowerCase()
  );
}

/** Get token symbol with fallback */
export function getTokenSymbol(address: Address): string {
  return getTokenMeta(address)?.symbol ?? `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Get token color for charts/badges */
export function getTokenColor(address: Address): string {
  return getTokenMeta(address)?.color ?? '#5a6a8a';
}

/** Popular token pairs for default display */
export const POPULAR_PAIRS: readonly [Address, Address][] = [
  [addr('01'), addr('02')],  // OCTA/sUSD
  [addr('03'), addr('02')],  // sETH/sUSD
  [addr('04'), addr('02')],  // sBTC/sUSD
  [addr('01'), addr('03')],  // OCTA/sETH
  [addr('06'), addr('01')],  // PRIV/OCTA
];

/** Stablecoins — used for price denomination */
export const STABLECOINS: readonly Address[] = [
  addr('02'), // sUSD
  addr('05'), // sDAI
];

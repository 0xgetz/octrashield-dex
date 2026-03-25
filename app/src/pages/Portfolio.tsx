/**
 * Portfolio Page — Token balances overview with encrypted values.
 *
 * Features:
 * - Total portfolio value (encrypted, revealable)
 * - Token balance cards with logos and USD estimates
 * - Quick actions: send, receive, swap
 * - Wallet address and HFHE key status
 */

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { KNOWN_TOKENS, getTokenMeta } from '@/config/tokens.js';
import { useWallet } from '@/providers/WalletProvider.js';
import { variants } from '@/config/theme.js';
import {
  Card,
  Button,
  TokenIcon,
  StatusBadge,
  EncryptedValue,
  Tooltip,
} from '@/components/common/index.js';

// ============================================================================
// Mock Balance Data
// ============================================================================

interface TokenBalanceRow {
  address: Address;
  balance: string;
  balanceUsd: string;
  change24h: string;
  changePositive: boolean;
}

const MOCK_BALANCES: TokenBalanceRow[] = [
  { address: KNOWN_TOKENS[0].address, balance: '12,450.00', balanceUsd: '$12,450.00', change24h: '+2.4%', changePositive: true },
  { address: KNOWN_TOKENS[1].address, balance: '8,320.50', balanceUsd: '$8,320.50', change24h: '+0.01%', changePositive: true },
  { address: KNOWN_TOKENS[2].address, balance: '3.2150', balanceUsd: '$6,574.70', change24h: '-1.8%', changePositive: false },
  { address: KNOWN_TOKENS[3].address, balance: '0.1542', balanceUsd: '$9,408.42', change24h: '+3.1%', changePositive: true },
  { address: KNOWN_TOKENS[5].address, balance: '5,000.00', balanceUsd: '$2,150.00', change24h: '+8.5%', changePositive: true },
  { address: KNOWN_TOKENS[4].address, balance: '1,200.00', balanceUsd: '$1,200.00', change24h: '+0.02%', changePositive: true },
  { address: KNOWN_TOKENS[6].address, balance: '120.00', balanceUsd: '$1,680.00', change24h: '-0.5%', changePositive: false },
  { address: KNOWN_TOKENS[7].address, balance: '45.00', balanceUsd: '$5,850.00', change24h: '+4.2%', changePositive: true },
];

// ============================================================================
// Component
// ============================================================================

export function Portfolio() {
  const { status, displayAddress, hasKeys, address } = useWallet();
  const connected = status === 'connected';

  const totalUsd = MOCK_BALANCES.reduce(
    (sum, b) => sum + parseFloat(b.balanceUsd.replace(/[$,]/g, '')),
    0
  );

  return (
    <motion.div variants={variants.fadeIn} initial="initial" animate="animate">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-50">Portfolio</h1>
        <p className="text-sm text-surface-400 mt-0.5">Your encrypted token balances</p>
      </div>

      {!connected ? (
        <Card className="text-center py-16">
          <svg className="w-12 h-12 text-surface-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
          </svg>
          <h3 className="text-lg font-semibold text-surface-200 mb-2">Connect Your Wallet</h3>
          <p className="text-sm text-surface-400 mb-4">View your encrypted token balances</p>
          <Button variant="primary" size="md">Connect Wallet</Button>
        </Card>
      ) : (
        <>
          {/* Wallet info + total value */}
          <Card glow className="mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="stat-label mb-1">Total Portfolio Value</p>
                <EncryptedValue
                  value={`$${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  size="lg"
                  revealable
                />
              </div>
              <div className="flex flex-col sm:items-end gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-surface-400">Wallet:</span>
                  <span className="font-mono text-sm text-surface-200">{displayAddress}</span>
                </div>
                <div className="flex items-center gap-2">
                  {hasKeys ? (
                    <StatusBadge variant="shield" pulse size="sm">
                      HFHE Keys Active
                    </StatusBadge>
                  ) : (
                    <StatusBadge variant="warning" size="sm">
                      Keys Not Derived
                    </StatusBadge>
                  )}
                  <Tooltip content="Your HFHE key fingerprint">
                    <span className="text-2xs font-mono text-surface-500">
                      {address?.slice(2, 10).toUpperCase()}
                    </span>
                  </Tooltip>
                </div>
              </div>
            </div>
          </Card>

          {/* Token Balances */}
          <div className="space-y-2">
            {MOCK_BALANCES.map((row, i) => {
              const meta = getTokenMeta(row.address);
              if (!meta) return null;

              return (
                <motion.div
                  key={row.address}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card compact hover>
                    <div className="flex items-center justify-between">
                      {/* Left: token info */}
                      <div className="flex items-center gap-3">
                        <TokenIcon address={row.address} size={36} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-surface-50">{meta.symbol}</span>
                            {meta.isNative && <StatusBadge variant="info" size="sm">Native</StatusBadge>}
                            {meta.isStable && <StatusBadge variant="success" size="sm">Stable</StatusBadge>}
                          </div>
                          <span className="text-xs text-surface-400">{meta.name}</span>
                        </div>
                      </div>

                      {/* Right: balance + value */}
                      <div className="text-right">
                        <EncryptedValue value={row.balance} displayValue={`${row.balance} ${meta.symbol}`} size="sm" revealable />
                        <div className="flex items-center justify-end gap-2 mt-0.5">
                          <span className="text-xs text-surface-400 font-mono">{row.balanceUsd}</span>
                          <span className={clsx(
                            'text-2xs font-medium',
                            row.changePositive ? 'text-emerald-400' : 'text-red-400'
                          )}>
                            {row.change24h}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick actions (visible on hover via Card hover prop) */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-500/10">
                      <Link to="/swap" className="flex-1">
                        <Button variant="secondary" size="sm" fullWidth>Swap</Button>
                      </Link>
                      <Button variant="ghost" size="sm" className="flex-1">Send</Button>
                      <Button variant="ghost" size="sm" className="flex-1">Receive</Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Privacy footer */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-surface-400">
            <svg className="w-3.5 h-3.5 text-shield-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
            </svg>
            <span>All balances are HFHE-encrypted on-chain. Only you can decrypt them.</span>
          </div>
        </>
      )}
    </motion.div>
  );
}

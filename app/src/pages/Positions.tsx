/**
 * Positions Page — User's active liquidity positions.
 *
 * Features:
 * - Position cards with token pair, range, liquidity
 * - Encrypted values with reveal toggle
 * - Fees earned (uncollected)
 * - In-range / out-of-range status
 * - Collect fees action
 * - Remove liquidity action
 * - Link to add more liquidity
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { getTokenMeta } from '@/config/tokens.js';
import { useWallet } from '@/providers/WalletProvider.js';
import { useOctra } from '@/providers/OctraProvider.js';
import { variants } from '@/config/theme.js';
import {
  Card,
  Button,
  TokenPairIcon,
  StatusBadge,
  EncryptedValue,
  Tooltip,
  Modal,
} from '@/components/common/index.js';

// ============================================================================
// Mock Position Data
// ============================================================================

const addr = (s: string): Address => `0x${'0'.repeat(64 - s.length)}${s}` as Address;

interface Position {
  id: string;
  token0: Address;
  token1: Address;
  feeTier: string;
  tickLower: number;
  tickUpper: number;
  priceLower: string;
  priceUpper: string;
  currentPrice: string;
  inRange: boolean;
  liquidity: string;
  liquidityUsd: string;
  feesEarned0: string;
  feesEarned1: string;
  feesUsd: string;
  apr: string;
  createdAt: string;
}

const MOCK_POSITIONS: Position[] = [
  {
    id: 'pos-1',
    token0: addr('01'), token1: addr('02'),
    feeTier: '0.30%',
    tickLower: 200100, tickUpper: 208900,
    priceLower: '0.95', priceUpper: '1.05',
    currentPrice: '1.0023',
    inRange: true,
    liquidity: '45,230',
    liquidityUsd: '$45,230',
    feesEarned0: '12.45',
    feesEarned1: '14.22',
    feesUsd: '$26.67',
    apr: '12.4%',
    createdAt: '2 days ago',
  },
  {
    id: 'pos-2',
    token0: addr('03'), token1: addr('02'),
    feeTier: '0.30%',
    tickLower: 195000, tickUpper: 215000,
    priceLower: '1,800', priceUpper: '2,200',
    currentPrice: '2,045',
    inRange: true,
    liquidity: '18,500',
    liquidityUsd: '$18,500',
    feesEarned0: '0.0045',
    feesEarned1: '8.12',
    feesUsd: '$17.34',
    apr: '9.8%',
    createdAt: '1 week ago',
  },
  {
    id: 'pos-3',
    token0: addr('06'), token1: addr('01'),
    feeTier: '0.30%',
    tickLower: 180000, tickUpper: 200000,
    priceLower: '0.42', priceUpper: '0.55',
    currentPrice: '0.61',
    inRange: false,
    liquidity: '8,200',
    liquidityUsd: '$8,200',
    feesEarned0: '34.5',
    feesEarned1: '5.8',
    feesUsd: '$20.20',
    apr: '0.0%',
    createdAt: '3 weeks ago',
  },
];

// ============================================================================
// Component
// ============================================================================

export function Positions() {
  const { status } = useWallet();
  const { notify } = useOctra();
  const connected = status === 'connected';

  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  const handleCollectFees = useCallback(async (pos: Position) => {
    setCollectingId(pos.id);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      notify.success(`Collected ${pos.feesUsd} in fees from ${getTokenMeta(pos.token0)?.symbol}/${getTokenMeta(pos.token1)?.symbol}`);
    } catch {
      notify.error('Failed to collect fees');
    } finally {
      setCollectingId(null);
    }
  }, [notify]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!selectedPosition) return;
    setRemovingId(selectedPosition.id);
    setShowRemoveModal(false);
    try {
      await new Promise((r) => setTimeout(r, 2000));
      notify.success('Liquidity removed successfully');
    } catch {
      notify.error('Failed to remove liquidity');
    } finally {
      setRemovingId(null);
      setSelectedPosition(null);
    }
  }, [selectedPosition, notify]);

  const inRangeCount = MOCK_POSITIONS.filter((p) => p.inRange).length;
  const totalValueUsd = MOCK_POSITIONS.reduce((s, p) => s + parseFloat(p.liquidityUsd.replace(/[$,]/g, '')), 0);
  const totalFeesUsd = MOCK_POSITIONS.reduce((s, p) => s + parseFloat(p.feesUsd.replace(/[$,]/g, '')), 0);

  return (
    <motion.div variants={variants.fadeIn} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-50">Your Positions</h1>
          <p className="text-sm text-surface-400 mt-0.5">Manage your encrypted liquidity positions</p>
        </div>
        <Link to="/add-liquidity">
          <Button variant="primary" size="md">+ New Position</Button>
        </Link>
      </div>

      {!connected ? (
        <Card className="text-center py-16">
          <svg className="w-12 h-12 text-surface-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h3 className="text-lg font-semibold text-surface-200 mb-2">Connect Your Wallet</h3>
          <p className="text-sm text-surface-400 mb-4">Connect your wallet to view your positions</p>
          <Button variant="primary" size="md">Connect Wallet</Button>
        </Card>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card compact>
              <p className="stat-label">Total Value</p>
              <EncryptedValue value={`$${totalValueUsd.toLocaleString()}`} size="lg" revealable />
            </Card>
            <Card compact>
              <p className="stat-label">Uncollected Fees</p>
              <EncryptedValue value={`$${totalFeesUsd.toFixed(2)}`} size="lg" revealable />
            </Card>
            <Card compact>
              <p className="stat-label">Active / Total</p>
              <p className="stat-value">{inRangeCount} / {MOCK_POSITIONS.length}</p>
            </Card>
          </div>

          {/* Position Cards */}
          <div className="space-y-4">
            {MOCK_POSITIONS.map((pos, i) => {
              const t0 = getTokenMeta(pos.token0);
              const t1 = getTokenMeta(pos.token1);
              const isCollecting = collectingId === pos.id;
              const isRemoving = removingId === pos.id;

              return (
                <motion.div
                  key={pos.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card hover glow={pos.inRange}>
                    {/* Position header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <TokenPairIcon token0={pos.token0} token1={pos.token1} size={28} />
                        <div>
                          <span className="font-semibold text-surface-50">
                            {t0?.symbol}/{t1?.symbol}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <StatusBadge variant="neutral" size="sm">{pos.feeTier}</StatusBadge>
                            <StatusBadge
                              variant={pos.inRange ? 'success' : 'warning'}
                              pulse={pos.inRange}
                              size="sm"
                            >
                              {pos.inRange ? 'In Range' : 'Out of Range'}
                            </StatusBadge>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <EncryptedValue value={pos.liquidityUsd} size="md" revealable />
                        <div className="text-2xs text-surface-500 mt-0.5">{pos.createdAt}</div>
                      </div>
                    </div>

                    {/* Range and stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div>
                        <p className="text-2xs text-surface-500 uppercase">Min Price</p>
                        <p className="text-sm font-mono text-surface-200">{pos.priceLower}</p>
                      </div>
                      <div>
                        <p className="text-2xs text-surface-500 uppercase">Max Price</p>
                        <p className="text-sm font-mono text-surface-200">{pos.priceUpper}</p>
                      </div>
                      <div>
                        <p className="text-2xs text-surface-500 uppercase">Current</p>
                        <p className={clsx('text-sm font-mono', pos.inRange ? 'text-emerald-400' : 'text-amber-400')}>
                          {pos.currentPrice}
                        </p>
                      </div>
                      <div>
                        <Tooltip content="Annualized return based on fees earned">
                          <p className="text-2xs text-surface-500 uppercase border-b border-dashed border-surface-600">APR</p>
                        </Tooltip>
                        <p className={clsx('text-sm font-mono font-medium', pos.inRange ? 'text-emerald-400' : 'text-surface-400')}>
                          {pos.apr}
                        </p>
                      </div>
                    </div>

                    {/* Range bar */}
                    <div className="h-1.5 rounded-full bg-surface-700 relative mb-4 overflow-hidden">
                      <div
                        className={clsx(
                          'absolute h-full rounded-full',
                          pos.inRange ? 'bg-gradient-to-r from-octra-500 to-shield-500' : 'bg-amber-500/40'
                        )}
                        style={{ left: '25%', right: '25%' }}
                      />
                      {pos.inRange && (
                        <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 bg-white rounded-full shadow" style={{ left: '48%' }} />
                      )}
                    </div>

                    {/* Fees earned */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-surface-700/30 mb-4">
                      <div>
                        <p className="text-2xs text-surface-500 uppercase mb-1">Uncollected Fees</p>
                        <div className="flex items-center gap-3">
                          <EncryptedValue value={`${pos.feesEarned0} ${t0?.symbol}`} size="sm" revealable />
                          <span className="text-surface-500">+</span>
                          <EncryptedValue value={`${pos.feesEarned1} ${t1?.symbol}`} size="sm" revealable />
                        </div>
                        <p className="text-xs text-surface-400 mt-0.5 font-mono">{pos.feesUsd}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isCollecting}
                        onClick={() => handleCollectFees(pos)}
                        className="flex-1"
                      >
                        Collect Fees
                      </Button>
                      <Link to={`/add-liquidity/${pos.id}`} className="flex-1">
                        <Button variant="secondary" size="sm" fullWidth>Increase</Button>
                      </Link>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={isRemoving}
                        onClick={() => { setSelectedPosition(pos); setShowRemoveModal(true); }}
                        className="flex-1"
                      >
                        Remove
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {MOCK_POSITIONS.length === 0 && (
            <Card className="text-center py-12">
              <h3 className="text-lg font-semibold text-surface-200 mb-2">No Positions Yet</h3>
              <p className="text-sm text-surface-400 mb-4">Add liquidity to a pool to start earning fees</p>
              <Link to="/add-liquidity">
                <Button variant="primary" size="md">Add Liquidity</Button>
              </Link>
            </Card>
          )}
        </>
      )}

      {/* Remove Liquidity Confirmation */}
      <Modal
        open={showRemoveModal}
        onClose={() => { setShowRemoveModal(false); setSelectedPosition(null); }}
        title="Remove Liquidity"
        size="sm"
      >
        {selectedPosition && (
          <div className="space-y-4">
            <p className="text-sm text-surface-300">
              Are you sure you want to remove your entire position in{' '}
              <span className="text-surface-50 font-semibold">
                {getTokenMeta(selectedPosition.token0)?.symbol}/{getTokenMeta(selectedPosition.token1)?.symbol}
              </span>?
            </p>

            <div className="p-3 rounded-xl bg-surface-700/30 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-surface-400">Liquidity</span>
                <EncryptedValue value={selectedPosition.liquidityUsd} size="sm" />
              </div>
              <div className="flex justify-between">
                <span className="text-surface-400">Uncollected Fees</span>
                <span className="text-surface-200 font-mono">{selectedPosition.feesUsd}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 text-xs text-amber-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>Fees will be automatically collected when you remove liquidity</span>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" size="md" fullWidth onClick={() => setShowRemoveModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="md" fullWidth onClick={handleRemoveLiquidity}>
                Remove Position
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}

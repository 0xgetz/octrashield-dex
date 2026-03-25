/**
 * Pools Page — Browse and explore liquidity pools.
 *
 * Features:
 * - Pool list with TVL, volume, fee tier
 * - Search / filter by token pair
 * - Sort by TVL, volume, APR
 * - Quick links to add liquidity or view details
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { FEE_TIERS } from '@octrashield/dex-sdk';
import { KNOWN_TOKENS, getTokenMeta } from '@/config/tokens.js';
import { variants } from '@/config/theme.js';
import {
  Card,
  StatCard,
  Button,
  TokenPairIcon,
  StatusBadge,
  EncryptedValue,
} from '@/components/common/index.js';

// ============================================================================
// Mock Pool Data
// ============================================================================

interface PoolRow {
  id: string;
  token0: Address;
  token1: Address;
  feeTier: number;
  tvl: string;
  tvlUsd: number;
  volume24h: string;
  volume24hUsd: number;
  apr: string;
  aprValue: number;
  isActive: boolean;
}

const addr = (s: string): Address => `0x${'0'.repeat(64 - s.length)}${s}` as Address;

const MOCK_POOLS: PoolRow[] = [
  { id: 'pool-1', token0: addr('01'), token1: addr('02'), feeTier: 2, tvl: '2.4M', tvlUsd: 2400000, volume24h: '890K', volume24hUsd: 890000, apr: '12.4%', aprValue: 12.4, isActive: true },
  { id: 'pool-2', token0: addr('03'), token1: addr('02'), feeTier: 2, tvl: '1.8M', tvlUsd: 1800000, volume24h: '650K', volume24hUsd: 650000, apr: '9.8%', aprValue: 9.8, isActive: true },
  { id: 'pool-3', token0: addr('04'), token1: addr('02'), feeTier: 3, tvl: '1.2M', tvlUsd: 1200000, volume24h: '420K', volume24hUsd: 420000, apr: '15.2%', aprValue: 15.2, isActive: true },
  { id: 'pool-4', token0: addr('01'), token1: addr('03'), feeTier: 2, tvl: '980K', tvlUsd: 980000, volume24h: '310K', volume24hUsd: 310000, apr: '8.6%', aprValue: 8.6, isActive: true },
  { id: 'pool-5', token0: addr('06'), token1: addr('01'), feeTier: 2, tvl: '560K', tvlUsd: 560000, volume24h: '180K', volume24hUsd: 180000, apr: '22.1%', aprValue: 22.1, isActive: true },
  { id: 'pool-6', token0: addr('07'), token1: addr('02'), feeTier: 2, tvl: '340K', tvlUsd: 340000, volume24h: '95K', volume24hUsd: 95000, apr: '7.3%', aprValue: 7.3, isActive: true },
  { id: 'pool-7', token0: addr('08'), token1: addr('01'), feeTier: 1, tvl: '210K', tvlUsd: 210000, volume24h: '78K', volume24hUsd: 78000, apr: '18.9%', aprValue: 18.9, isActive: true },
  { id: 'pool-8', token0: addr('02'), token1: addr('05'), feeTier: 0, tvl: '150K', tvlUsd: 150000, volume24h: '45K', volume24hUsd: 45000, apr: '3.2%', aprValue: 3.2, isActive: true },
];

type SortField = 'tvl' | 'volume' | 'apr';
type SortDir = 'asc' | 'desc';

// ============================================================================
// Component
// ============================================================================

export function Pools() {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('tvl');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterFeeTier, setFilterFeeTier] = useState<number | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filteredPools = useMemo(() => {
    let pools = [...MOCK_POOLS];

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      pools = pools.filter((p) => {
        const t0 = getTokenMeta(p.token0);
        const t1 = getTokenMeta(p.token1);
        return (
          t0?.symbol.toLowerCase().includes(q) ||
          t1?.symbol.toLowerCase().includes(q) ||
          t0?.name.toLowerCase().includes(q) ||
          t1?.name.toLowerCase().includes(q)
        );
      });
    }

    // Fee tier filter
    if (filterFeeTier !== null) {
      pools = pools.filter((p) => p.feeTier === filterFeeTier);
    }

    // Sort
    const sortKey = sortField === 'tvl' ? 'tvlUsd' : sortField === 'volume' ? 'volume24hUsd' : 'aprValue';
    pools.sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'desc' ? -diff : diff;
    });

    return pools;
  }, [search, sortField, sortDir, filterFeeTier]);

  const totalTvl = MOCK_POOLS.reduce((s, p) => s + p.tvlUsd, 0);
  const totalVol = MOCK_POOLS.reduce((s, p) => s + p.volume24hUsd, 0);

  return (
    <motion.div variants={variants.fadeIn} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-50">Pools</h1>
          <p className="text-sm text-surface-400 mt-0.5">Explore encrypted liquidity pools</p>
        </div>
        <Link to="/add-liquidity">
          <Button variant="primary" size="md">
            + New Position
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total TVL" value={`$${(totalTvl / 1e6).toFixed(1)}M`} />
        <StatCard label="24h Volume" value={`$${(totalVol / 1e6).toFixed(1)}M`} />
        <StatCard label="Active Pools" value={String(MOCK_POOLS.length)} />
        <StatCard label="Fee Tiers" value="4" />
      </div>

      {/* Filters */}
      <Card compact className="mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full sm:w-auto">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search by token name or symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-700/40 border border-surface-500/20 text-sm text-surface-100 placeholder:text-surface-500 outline-none focus:border-octra-500/40 transition-colors"
            />
          </div>

          {/* Fee tier filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-surface-400 mr-1">Fee:</span>
            <button
              onClick={() => setFilterFeeTier(null)}
              className={clsx(
                'px-2 py-1 rounded text-2xs font-medium transition-colors',
                filterFeeTier === null ? 'bg-octra-500/15 text-octra-400' : 'text-surface-400 hover:text-surface-200'
              )}
            >
              All
            </button>
            {FEE_TIERS.map((tier) => (
              <button
                key={tier.id}
                onClick={() => setFilterFeeTier(filterFeeTier === tier.id ? null : tier.id)}
                className={clsx(
                  'px-2 py-1 rounded text-2xs font-medium transition-colors',
                  filterFeeTier === tier.id ? 'bg-octra-500/15 text-octra-400' : 'text-surface-400 hover:text-surface-200'
                )}
              >
                {tier.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Pool Table */}
      <Card compact>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-500/15">
                <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3 pl-2">Pool</th>
                <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">Fee</th>
                <SortHeader label="TVL" field="tvl" current={sortField} dir={sortDir} onToggle={toggleSort} />
                <SortHeader label="24h Vol" field="volume" current={sortField} dir={sortDir} onToggle={toggleSort} />
                <SortHeader label="APR" field="apr" current={sortField} dir={sortDir} onToggle={toggleSort} />
                <th className="text-right text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-500/10">
              {filteredPools.map((pool, i) => {
                const t0 = getTokenMeta(pool.token0);
                const t1 = getTokenMeta(pool.token1);
                const feeTier = FEE_TIERS[pool.feeTier];

                return (
                  <motion.tr
                    key={pool.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="group hover:bg-surface-700/20 transition-colors"
                  >
                    <td className="py-3 pl-2">
                      <Link to={`/pools/${pool.id}`} className="flex items-center gap-3">
                        <TokenPairIcon token0={pool.token0} token1={pool.token1} size={24} />
                        <div>
                          <span className="font-semibold text-sm text-surface-50">
                            {t0?.symbol}/{t1?.symbol}
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3">
                      <StatusBadge variant="neutral" size="sm">{feeTier?.label.split(' ')[0]}</StatusBadge>
                    </td>
                    <td className="py-3">
                      <EncryptedValue value={`$${pool.tvl}`} size="sm" />
                    </td>
                    <td className="py-3">
                      <EncryptedValue value={`$${pool.volume24h}`} size="sm" />
                    </td>
                    <td className="py-3">
                      <span className={clsx(
                        'text-sm font-mono font-medium',
                        pool.aprValue > 15 ? 'text-emerald-400' : pool.aprValue > 8 ? 'text-octra-400' : 'text-surface-200'
                      )}>
                        {pool.apr}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link to={`/pools/${pool.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                        <Link to={`/add-liquidity/${pool.id}`}>
                          <Button variant="secondary" size="sm">Add</Button>
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>

          {filteredPools.length === 0 && (
            <div className="text-center py-12 text-sm text-surface-400">
              No pools match your search criteria
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// ============================================================================
// Sort Header
// ============================================================================

function SortHeader({
  label,
  field,
  current,
  dir,
  onToggle,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onToggle: (f: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th className="text-left pb-3">
      <button
        onClick={() => onToggle(field)}
        className={clsx(
          'text-2xs font-medium uppercase tracking-wider flex items-center gap-1 transition-colors',
          isActive ? 'text-octra-400' : 'text-surface-400 hover:text-surface-200'
        )}
      >
        {label}
        {isActive && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {dir === 'desc'
              ? <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
              : <path strokeLinecap="round" d="M5 15l7-7 7 7" />}
          </svg>
        )}
      </button>
    </th>
  );
}

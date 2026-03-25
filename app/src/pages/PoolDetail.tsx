/**
 * PoolDetail Page — Single pool view with charts, positions, and stats.
 *
 * Features:
 * - Pool stats header (TVL, volume, fees, APR)
 * - Price chart (placeholder for Recharts integration)
 * - Liquidity distribution visualization
 * - Recent transactions (encrypted)
 * - AI risk assessment for this pool
 */

import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { variants } from '@/config/theme.js';
import { getTokenMeta } from '@/config/tokens.js';
import type { Address } from '@octrashield/dex-sdk';
import {
  Card,
  StatCard,
  Button,
  TokenPairIcon,
  StatusBadge,
  EncryptedValue,
  Tooltip,
} from '@/components/common/index.js';

const addr = (s: string): Address => `0x${'0'.repeat(64 - s.length)}${s}` as Address;

export function PoolDetail() {
  const { poolId } = useParams<{ poolId: string }>();

  // Mock pool data (in production, fetched via usePool hook)
  const pool = {
    id: poolId ?? 'pool-1',
    token0: addr('01'),
    token1: addr('02'),
    feeTier: 2,
    currentTick: 204512,
    tvl: '$2.4M',
    volume24h: '$890K',
    fees24h: '$2,670',
    apr: '12.4%',
    isActive: true,
  };

  const t0 = getTokenMeta(pool.token0);
  const t1 = getTokenMeta(pool.token1);

  return (
    <motion.div variants={variants.fadeIn} initial="initial" animate="animate">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-surface-400 mb-4">
        <Link to="/pools" className="hover:text-surface-200 transition-colors">Pools</Link>
        <span>/</span>
        <span className="text-surface-200">{t0?.symbol}/{t1?.symbol}</span>
      </div>

      {/* Pool Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <TokenPairIcon token0={pool.token0} token1={pool.token1} size={36} />
          <div>
            <h1 className="text-2xl font-bold text-surface-50">
              {t0?.symbol}/{t1?.symbol}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge variant="neutral" size="sm">0.30% Fee</StatusBadge>
              <StatusBadge variant="success" pulse size="sm">Active</StatusBadge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/add-liquidity/${pool.id}`}>
            <Button variant="primary" size="md">+ Add Liquidity</Button>
          </Link>
          <Link to="/swap">
            <Button variant="secondary" size="md">Swap</Button>
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="TVL" value={pool.tvl} trend={{ value: '5.2%', positive: true }} />
        <StatCard label="24h Volume" value={pool.volume24h} trend={{ value: '12.8%', positive: true }} />
        <StatCard label="24h Fees" value={pool.fees24h} />
        <StatCard label="APR" value={pool.apr} trend={{ value: '1.2%', positive: true }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Price Chart Area */}
        <Card glow className="lg:col-span-2" header={
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-surface-50">Price Chart</h3>
            <div className="flex items-center gap-1">
              {['1H', '1D', '1W', '1M', 'ALL'].map((period) => (
                <button
                  key={period}
                  className={clsx(
                    'px-2 py-0.5 rounded text-2xs font-medium transition-colors',
                    period === '1D' ? 'bg-octra-500/15 text-octra-400' : 'text-surface-400 hover:text-surface-200'
                  )}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
        }>
          {/* Placeholder chart */}
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-surface-50 mb-1">1.0023</div>
              <div className="text-xs text-surface-400">{t0?.symbol} per {t1?.symbol}</div>
              <div className="mt-4 w-full h-32 bg-gradient-to-t from-octra-500/5 to-transparent rounded-lg flex items-end justify-center gap-px px-4">
                {/* Mock bar chart */}
                {Array.from({ length: 48 }, (_, i) => {
                  const h = 20 + Math.random() * 80;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-octra-500/30 hover:bg-octra-500/50 transition-colors"
                      style={{ height: `${h}%` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Pool Info Sidebar */}
        <div className="space-y-4">
          {/* Reserves */}
          <Card compact header={<h3 className="text-sm font-semibold text-surface-50">Reserves</h3>}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TokenPairIcon token0={pool.token0} token1={pool.token0} size={20} />
                  <span className="text-sm text-surface-200">{t0?.symbol}</span>
                </div>
                <EncryptedValue value="1,204,512" size="sm" revealable />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TokenPairIcon token0={pool.token1} token1={pool.token1} size={20} />
                  <span className="text-sm text-surface-200">{t1?.symbol}</span>
                </div>
                <EncryptedValue value="1,195,488" size="sm" revealable />
              </div>
            </div>
          </Card>

          {/* Pool Parameters */}
          <Card compact header={<h3 className="text-sm font-semibold text-surface-50">Parameters</h3>}>
            <div className="space-y-2">
              {[
                ['Current Tick', String(pool.currentTick)],
                ['Tick Spacing', '60'],
                ['Fee Tier', '0.30%'],
                ['Protocol Fee', '1/6 of LP fee'],
                ['Observation Slots', '720'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-surface-400">{label}</span>
                  <span className="text-surface-200 font-mono">{val}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* AI Assessment */}
          <Card compact glow header={
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-shield-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
              </svg>
              <h3 className="text-sm font-semibold text-surface-50">AI Risk Assessment</h3>
            </div>
          }>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">MEV Risk</span>
                <StatusBadge variant="success" size="sm">Low</StatusBadge>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Volatility</span>
                <StatusBadge variant="warning" size="sm">Moderate</StatusBadge>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Impermanent Loss</span>
                <Tooltip content="Estimated IL over the past 30 days">
                  <span className="text-amber-400 font-mono text-xs">-2.1%</span>
                </Tooltip>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Dynamic Fee</span>
                <EncryptedValue value="0.32%" size="sm" />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Liquidity Distribution */}
      <Card glow className="mt-4" header={
        <h3 className="font-semibold text-surface-50">Liquidity Distribution</h3>
      }>
        <div className="h-40 flex items-end justify-center gap-px px-2">
          {Array.from({ length: 60 }, (_, i) => {
            const center = 30;
            const dist = Math.abs(i - center);
            const h = Math.max(5, 100 - dist * dist * 0.12);
            const isCurrent = i === center;
            return (
              <div
                key={i}
                className={clsx(
                  'flex-1 rounded-t transition-colors',
                  isCurrent ? 'bg-octra-400' : 'bg-octra-500/20 hover:bg-octra-500/40'
                )}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-2xs text-surface-500 mt-2 px-2">
          <span>Lower Ticks</span>
          <span className="text-octra-400 font-medium">Current Price</span>
          <span>Upper Ticks</span>
        </div>
      </Card>
    </motion.div>
  );
}

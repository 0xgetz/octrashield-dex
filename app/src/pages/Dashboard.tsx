/**
 * AI Dashboard Page — OctraShield AI Engine monitoring.
 *
 * Features:
 * - Dynamic fee overview across pools
 * - MEV detection alerts with threat level
 * - Volatility metrics with EMA trends
 * - Rebalancing suggestions for user positions
 * - Risk scores per pool
 * - AI health status
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { getTokenMeta } from '@/config/tokens.js';
import { variants } from '@/config/theme.js';
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

// ============================================================================
// Mock AI Data
// ============================================================================

interface DynamicFeeRow {
  pool: string;
  token0: Address;
  token1: Address;
  baseFee: string;
  adjustedFee: string;
  multiplier: string;
  confidence: number;
}

interface MevAlert {
  id: string;
  pool: string;
  token0: Address;
  token1: Address;
  type: string;
  score: number;
  recommendation: string;
  detectedAt: string;
}

interface VolatilityRow {
  pool: string;
  token0: Address;
  token1: Address;
  shortTerm: string;
  longTerm: string;
  ratio: string;
  trend: 'up' | 'down' | 'stable';
}

interface RebalanceSuggestion {
  positionId: string;
  pool: string;
  token0: Address;
  token1: Address;
  currentRange: string;
  suggestedRange: string;
  improvement: string;
  confidence: number;
  reason: string;
}

const MOCK_FEES: DynamicFeeRow[] = [
  { pool: 'OCTA/sUSD', token0: addr('01'), token1: addr('02'), baseFee: '0.30%', adjustedFee: '0.32%', multiplier: '1.07x', confidence: 92 },
  { pool: 'sETH/sUSD', token0: addr('03'), token1: addr('02'), baseFee: '0.30%', adjustedFee: '0.28%', multiplier: '0.93x', confidence: 88 },
  { pool: 'sBTC/sUSD', token0: addr('04'), token1: addr('02'), baseFee: '1.00%', adjustedFee: '1.15%', multiplier: '1.15x', confidence: 85 },
  { pool: 'PRIV/OCTA', token0: addr('06'), token1: addr('01'), baseFee: '0.30%', adjustedFee: '0.45%', multiplier: '1.50x', confidence: 78 },
];

const MOCK_ALERTS: MevAlert[] = [
  { id: 'mev-1', pool: 'OCTA/sUSD', token0: addr('01'), token1: addr('02'), type: 'Sandwich Attempt', score: 82, recommendation: 'Blocked', detectedAt: '2 min ago' },
  { id: 'mev-2', pool: 'sETH/sUSD', token0: addr('03'), token1: addr('02'), type: 'Frontrun Detected', score: 65, recommendation: 'Fee Increased', detectedAt: '15 min ago' },
  { id: 'mev-3', pool: 'PRIV/OCTA', token0: addr('06'), token1: addr('01'), type: 'Price Manipulation', score: 45, recommendation: 'Monitoring', detectedAt: '1 hr ago' },
];

const MOCK_VOLATILITY: VolatilityRow[] = [
  { pool: 'OCTA/sUSD', token0: addr('01'), token1: addr('02'), shortTerm: '2.4%', longTerm: '1.8%', ratio: '1.33', trend: 'up' },
  { pool: 'sETH/sUSD', token0: addr('03'), token1: addr('02'), shortTerm: '3.1%', longTerm: '2.9%', ratio: '1.07', trend: 'stable' },
  { pool: 'sBTC/sUSD', token0: addr('04'), token1: addr('02'), shortTerm: '4.5%', longTerm: '3.2%', ratio: '1.41', trend: 'up' },
  { pool: 'PRIV/OCTA', token0: addr('06'), token1: addr('01'), shortTerm: '6.2%', longTerm: '7.8%', ratio: '0.79', trend: 'down' },
];

const MOCK_REBALANCE: RebalanceSuggestion[] = [
  {
    positionId: 'pos-3',
    pool: 'PRIV/OCTA', token0: addr('06'), token1: addr('01'),
    currentRange: '0.42 - 0.55',
    suggestedRange: '0.56 - 0.68',
    improvement: '+18.5%',
    confidence: 84,
    reason: 'Price has moved above your range. Rebalancing would capture current trading activity.',
  },
];

type Tab = 'fees' | 'mev' | 'volatility' | 'rebalance';

// ============================================================================
// Component
// ============================================================================

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('fees');

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'fees', label: 'Dynamic Fees' },
    { id: 'mev', label: 'MEV Shield', count: MOCK_ALERTS.length },
    { id: 'volatility', label: 'Volatility' },
    { id: 'rebalance', label: 'Rebalance', count: MOCK_REBALANCE.length },
  ];

  return (
    <motion.div variants={variants.fadeIn} initial="initial" animate="animate">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <svg className="w-7 h-7 text-shield-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
          </svg>
          <h1 className="text-2xl font-bold text-surface-50">AI Dashboard</h1>
        </div>
        <p className="text-sm text-surface-400">Real-time AI engine metrics, MEV protection, and optimization suggestions</p>
      </div>

      {/* AI Health Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="AI Engine Status"
          value="Online"
          icon={
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          }
        />
        <StatCard
          label="MEV Blocked (24h)"
          value="12"
          trend={{ value: '3 more than yesterday', positive: true }}
        />
        <StatCard
          label="Avg Fee Adjustment"
          value="1.12x"
          subValue="Across all pools"
        />
        <StatCard
          label="Rebalance Suggestions"
          value={String(MOCK_REBALANCE.length)}
          subValue="Pending review"
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-surface-500/15 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium transition-colors relative',
              activeTab === tab.id ? 'tab-active' : 'tab-inactive'
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={clsx(
                  'px-1.5 py-0.5 rounded-full text-2xs font-bold',
                  activeTab === tab.id
                    ? 'bg-octra-500/20 text-octra-400'
                    : 'bg-surface-700 text-surface-400'
                )}>
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'fees' && <DynamicFeesTab />}
        {activeTab === 'mev' && <MevShieldTab />}
        {activeTab === 'volatility' && <VolatilityTab />}
        {activeTab === 'rebalance' && <RebalanceTab />}
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// Dynamic Fees Tab
// ============================================================================

function DynamicFeesTab() {
  return (
    <Card compact>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-500/15">
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3 pl-2">Pool</th>
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">Base Fee</th>
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">AI Adjusted</th>
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">Multiplier</th>
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-500/10">
            {MOCK_FEES.map((row) => (
              <tr key={row.pool} className="hover:bg-surface-700/20 transition-colors">
                <td className="py-3 pl-2">
                  <div className="flex items-center gap-2">
                    <TokenPairIcon token0={row.token0} token1={row.token1} size={20} />
                    <span className="text-sm font-medium text-surface-100">{row.pool}</span>
                  </div>
                </td>
                <td className="py-3 text-sm font-mono text-surface-300">{row.baseFee}</td>
                <td className="py-3">
                  <EncryptedValue value={row.adjustedFee} size="sm" />
                </td>
                <td className="py-3">
                  <span className={clsx(
                    'text-sm font-mono font-medium',
                    parseFloat(row.multiplier) > 1.1 ? 'text-amber-400' :
                    parseFloat(row.multiplier) < 0.95 ? 'text-emerald-400' : 'text-surface-200'
                  )}>
                    {row.multiplier}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-surface-700 overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full',
                          row.confidence > 85 ? 'bg-emerald-400' : row.confidence > 70 ? 'bg-amber-400' : 'bg-red-400'
                        )}
                        style={{ width: `${row.confidence}%` }}
                      />
                    </div>
                    <span className="text-2xs text-surface-400 font-mono">{row.confidence}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================================
// MEV Shield Tab
// ============================================================================

function MevShieldTab() {
  return (
    <div className="space-y-3">
      {MOCK_ALERTS.map((alert, i) => (
        <motion.div
          key={alert.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
        >
          <Card compact hover>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {/* Threat icon */}
                <div className={clsx(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  alert.score > 70 ? 'bg-red-500/10' : alert.score > 50 ? 'bg-amber-500/10' : 'bg-surface-700/40'
                )}>
                  <svg
                    className={clsx(
                      'w-5 h-5',
                      alert.score > 70 ? 'text-red-400' : alert.score > 50 ? 'text-amber-400' : 'text-surface-400'
                    )}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-surface-50">{alert.type}</span>
                    <TokenPairIcon token0={alert.token0} token1={alert.token1} size={16} />
                    <span className="text-xs text-surface-400">{alert.pool}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Tooltip content="Suspicion score from AI analysis (0-100)">
                      <span className="text-surface-400">Score: <span className={clsx(
                        'font-mono font-medium',
                        alert.score > 70 ? 'text-red-400' : alert.score > 50 ? 'text-amber-400' : 'text-surface-200'
                      )}>{alert.score}/100</span></span>
                    </Tooltip>
                    <span className="text-surface-500">|</span>
                    <span className="text-surface-400">{alert.detectedAt}</span>
                  </div>
                </div>
              </div>

              <StatusBadge
                variant={alert.recommendation === 'Blocked' ? 'success' : alert.recommendation === 'Fee Increased' ? 'warning' : 'info'}
                size="sm"
              >
                {alert.recommendation}
              </StatusBadge>
            </div>
          </Card>
        </motion.div>
      ))}

      {MOCK_ALERTS.length === 0 && (
        <Card className="text-center py-12">
          <svg className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
          </svg>
          <h3 className="text-surface-200 font-semibold">All Clear</h3>
          <p className="text-sm text-surface-400 mt-1">No MEV threats detected recently</p>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Volatility Tab
// ============================================================================

function VolatilityTab() {
  return (
    <Card compact>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-500/15">
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3 pl-2">Pool</th>
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">Short-Term</th>
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">Long-Term</th>
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">
                <Tooltip content="Short-term / Long-term volatility ratio. >1 = increasing, <1 = decreasing">
                  <span className="border-b border-dashed border-surface-500">Vol Ratio</span>
                </Tooltip>
              </th>
              <th className="text-left text-2xs font-medium text-surface-400 uppercase tracking-wider pb-3">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-500/10">
            {MOCK_VOLATILITY.map((row) => (
              <tr key={row.pool} className="hover:bg-surface-700/20 transition-colors">
                <td className="py-3 pl-2">
                  <div className="flex items-center gap-2">
                    <TokenPairIcon token0={row.token0} token1={row.token1} size={20} />
                    <span className="text-sm font-medium text-surface-100">{row.pool}</span>
                  </div>
                </td>
                <td className="py-3">
                  <EncryptedValue value={row.shortTerm} size="sm" />
                </td>
                <td className="py-3">
                  <EncryptedValue value={row.longTerm} size="sm" />
                </td>
                <td className="py-3">
                  <span className={clsx(
                    'text-sm font-mono font-medium',
                    parseFloat(row.ratio) > 1.2 ? 'text-red-400' :
                    parseFloat(row.ratio) < 0.9 ? 'text-emerald-400' : 'text-amber-400'
                  )}>
                    {row.ratio}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-1">
                    {row.trend === 'up' && (
                      <>
                        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" d="M5 15l7-7 7 7" />
                        </svg>
                        <span className="text-xs text-red-400">Rising</span>
                      </>
                    )}
                    {row.trend === 'down' && (
                      <>
                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        <span className="text-xs text-emerald-400">Falling</span>
                      </>
                    )}
                    {row.trend === 'stable' && (
                      <>
                        <svg className="w-3.5 h-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" d="M5 12h14" />
                        </svg>
                        <span className="text-xs text-surface-400">Stable</span>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================================
// Rebalance Tab
// ============================================================================

function RebalanceTab() {
  return (
    <div className="space-y-3">
      {MOCK_REBALANCE.map((suggestion, i) => (
        <motion.div
          key={suggestion.positionId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <Card glow>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <TokenPairIcon token0={suggestion.token0} token1={suggestion.token1} size={28} />
                <div>
                  <span className="font-semibold text-surface-50">{suggestion.pool}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge variant="shield" size="sm">AI Suggestion</StatusBadge>
                    <span className="text-2xs text-surface-400">Confidence: {suggestion.confidence}%</span>
                  </div>
                </div>
              </div>
              <span className="text-emerald-400 font-mono font-semibold text-sm">
                {suggestion.improvement} APR
              </span>
            </div>

            <p className="text-xs text-surface-300 mb-3">{suggestion.reason}</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-2.5 rounded-lg bg-surface-700/30">
                <p className="text-2xs text-surface-500 uppercase mb-1">Current Range</p>
                <p className="text-sm font-mono text-surface-200">{suggestion.currentRange}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-octra-500/5 border border-octra-500/20">
                <p className="text-2xs text-octra-400 uppercase mb-1">Suggested Range</p>
                <p className="text-sm font-mono text-octra-300">{suggestion.suggestedRange}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="primary" size="sm" className="flex-1">Apply Rebalance</Button>
              <Button variant="ghost" size="sm">Dismiss</Button>
            </div>
          </Card>
        </motion.div>
      ))}

      {MOCK_REBALANCE.length === 0 && (
        <Card className="text-center py-12">
          <h3 className="text-surface-200 font-semibold">No Suggestions</h3>
          <p className="text-sm text-surface-400 mt-1">All your positions are optimally placed</p>
        </Card>
      )}
    </div>
  );
}

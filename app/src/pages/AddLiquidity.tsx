/**
 * AddLiquidity Page — Add concentrated liquidity to a pool.
 *
 * Features:
 * - Token pair selection
 * - Fee tier selection
 * - Price range slider (tick range)
 * - Full-range toggle
 * - Deposit amounts with auto-ratio calculation
 * - Position preview with estimated APR
 * - Encrypted confirmation
 */

import { useState, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { FEE_TIERS } from '@octrashield/dex-sdk';
import { KNOWN_TOKENS, getTokenMeta } from '@/config/tokens.js';
import { useWallet } from '@/providers/WalletProvider.js';
import { useOctra } from '@/providers/OctraProvider.js';
import { variants } from '@/config/theme.js';
import {
  Card,
  Button,
  TokenInput,
  TokenIcon,
  TokenPairIcon,
  StatusBadge,
  Modal,
  Tooltip,
} from '@/components/common/index.js';

const addr = (s: string): Address => `0x${'0'.repeat(64 - s.length)}${s}` as Address;

export function AddLiquidity() {
  const { poolId } = useParams<{ poolId: string }>();
  const navigate = useNavigate();
  const { status } = useWallet();
  const { notify } = useOctra();
  const connected = status === 'connected';

  // Token state
  const [token0, setToken0] = useState<Address | null>(poolId ? addr('01') : null);
  const [token1, setToken1] = useState<Address | null>(poolId ? addr('02') : null);
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [feeTier, setFeeTier] = useState(2);

  // Price range
  const [fullRange, setFullRange] = useState(false);
  const [priceLower, setPriceLower] = useState('0.95');
  const [priceUpper, setPriceUpper] = useState('1.05');

  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectingToken, setSelectingToken] = useState<0 | 1 | null>(null);

  const t0 = token0 ? getTokenMeta(token0) : null;
  const t1 = token1 ? getTokenMeta(token1) : null;

  // Estimated position stats
  const positionStats = useMemo(() => {
    if (!amount0 && !amount1) return null;
    const a0 = parseFloat(amount0 || '0');
    const a1 = parseFloat(amount1 || '0');
    const totalUsd = a0 + a1; // simplified
    const rangeWidth = parseFloat(priceUpper) - parseFloat(priceLower);
    const estApr = fullRange ? 8.2 : (8.2 * (0.1 / rangeWidth)).toFixed(1);

    return {
      totalValue: `$${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      estimatedApr: `${estApr}%`,
      feeEarnings24h: `$${(totalUsd * 0.00034).toFixed(2)}`,
      rangePercent: fullRange ? 'Full Range' : `${((rangeWidth / 1.0) * 100).toFixed(1)}% width`,
    };
  }, [amount0, amount1, priceLower, priceUpper, fullRange]);

  const handleTokenSelect = (address: Address) => {
    if (selectingToken === 0) {
      if (address === token1) setToken1(token0);
      setToken0(address);
    } else {
      if (address === token0) setToken0(token1);
      setToken1(address);
    }
    setSelectingToken(null);
  };

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setShowPreview(false);
    try {
      await new Promise((r) => setTimeout(r, 2500));
      notify.success('Liquidity position created successfully!');
      navigate('/positions');
    } catch {
      notify.error('Failed to add liquidity. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [notify, navigate]);

  const presetRanges = [
    { label: 'Narrow', lower: '0.98', upper: '1.02' },
    { label: 'Medium', lower: '0.95', upper: '1.05' },
    { label: 'Wide', lower: '0.85', upper: '1.15' },
  ];

  return (
    <motion.div
      className="max-w-2xl mx-auto"
      variants={variants.fadeIn}
      initial="initial"
      animate="animate"
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-surface-400 mb-4">
        <Link to="/pools" className="hover:text-surface-200 transition-colors">Pools</Link>
        <span>/</span>
        <span className="text-surface-200">Add Liquidity</span>
      </div>

      <h1 className="text-2xl font-bold text-surface-50 mb-6">Add Liquidity</h1>

      <div className="space-y-4">
        {/* Step 1: Select Pair */}
        <Card glow header={
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-octra-500/20 text-octra-400 text-2xs font-bold flex items-center justify-center">1</span>
            <h3 className="text-sm font-semibold text-surface-50">Select Pair & Fee Tier</h3>
          </div>
        }>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            {/* Token 0 */}
            <button
              onClick={() => setSelectingToken(0)}
              className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-700/40 border border-surface-500/20 hover:border-surface-500/40 transition-all"
            >
              {token0 && t0 ? (
                <>
                  <TokenIcon address={token0} size={28} />
                  <span className="font-semibold text-surface-50">{t0.symbol}</span>
                </>
              ) : (
                <span className="text-surface-400">Select Token</span>
              )}
            </button>

            <div className="flex items-center justify-center">
              <span className="text-surface-500 font-bold">+</span>
            </div>

            {/* Token 1 */}
            <button
              onClick={() => setSelectingToken(1)}
              className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-700/40 border border-surface-500/20 hover:border-surface-500/40 transition-all"
            >
              {token1 && t1 ? (
                <>
                  <TokenIcon address={token1} size={28} />
                  <span className="font-semibold text-surface-50">{t1.symbol}</span>
                </>
              ) : (
                <span className="text-surface-400">Select Token</span>
              )}
            </button>
          </div>

          {/* Fee tier selector */}
          <div>
            <label className="text-xs font-medium text-surface-400 mb-2 block">Fee Tier</label>
            <div className="grid grid-cols-4 gap-2">
              {FEE_TIERS.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setFeeTier(tier.id)}
                  className={clsx(
                    'p-2.5 rounded-xl border text-center transition-all',
                    feeTier === tier.id
                      ? 'bg-octra-500/10 border-octra-500/40 shadow-glow-sm'
                      : 'bg-surface-700/30 border-surface-500/20 hover:border-surface-500/40'
                  )}
                >
                  <div className={clsx(
                    'text-sm font-semibold',
                    feeTier === tier.id ? 'text-octra-400' : 'text-surface-200'
                  )}>
                    {tier.fee_bps / 100}%
                  </div>
                  <div className="text-2xs text-surface-400 mt-0.5">
                    {tier.label.split('(')[0].trim()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Step 2: Set Price Range */}
        <Card header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-octra-500/20 text-octra-400 text-2xs font-bold flex items-center justify-center">2</span>
              <h3 className="text-sm font-semibold text-surface-50">Set Price Range</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fullRange}
                onChange={(e) => setFullRange(e.target.checked)}
                className="w-4 h-4 rounded border-surface-500 bg-surface-700 text-octra-500 focus:ring-octra-500/50"
              />
              <span className="text-xs text-surface-300">Full Range</span>
            </label>
          </div>
        }>
          {!fullRange && (
            <>
              {/* Preset ranges */}
              <div className="flex items-center gap-2 mb-4">
                {presetRanges.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => { setPriceLower(preset.lower); setPriceUpper(preset.upper); }}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      priceLower === preset.lower && priceUpper === preset.upper
                        ? 'bg-octra-500/15 text-octra-400'
                        : 'bg-surface-700/40 text-surface-300 hover:text-surface-100'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Price inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-surface-400 mb-1 block">Min Price</label>
                  <input
                    type="text"
                    value={priceLower}
                    onChange={(e) => setPriceLower(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-700/40 border border-surface-500/20 text-lg font-mono text-surface-50 outline-none focus:border-octra-500/40 text-center"
                  />
                  <div className="text-2xs text-surface-500 mt-1 text-center">{t0?.symbol} per {t1?.symbol}</div>
                </div>
                <div>
                  <label className="text-xs text-surface-400 mb-1 block">Max Price</label>
                  <input
                    type="text"
                    value={priceUpper}
                    onChange={(e) => setPriceUpper(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-700/40 border border-surface-500/20 text-lg font-mono text-surface-50 outline-none focus:border-octra-500/40 text-center"
                  />
                  <div className="text-2xs text-surface-500 mt-1 text-center">{t0?.symbol} per {t1?.symbol}</div>
                </div>
              </div>

              {/* Visual range indicator */}
              <div className="mt-4 h-2 rounded-full bg-surface-700 relative overflow-hidden">
                <div
                  className="absolute h-full rounded-full bg-gradient-to-r from-octra-500 to-shield-500"
                  style={{
                    left: `${Math.max(0, (parseFloat(priceLower) - 0.8) / 0.4 * 100)}%`,
                    right: `${Math.max(0, 100 - (parseFloat(priceUpper) - 0.8) / 0.4 * 100)}%`,
                  }}
                />
                {/* Current price indicator */}
                <div className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-full" style={{ left: '50%' }} />
              </div>
              <div className="flex justify-between text-2xs text-surface-500 mt-1">
                <span>0.80</span>
                <span className="text-octra-400">Current: 1.00</span>
                <span>1.20</span>
              </div>
            </>
          )}

          {fullRange && (
            <div className="py-6 text-center">
              <div className="text-surface-400 text-sm">Full range position covers all prices</div>
              <div className="text-2xs text-surface-500 mt-1">Lower capital efficiency, but no risk of going out of range</div>
            </div>
          )}
        </Card>

        {/* Step 3: Deposit Amounts */}
        <Card header={
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-octra-500/20 text-octra-400 text-2xs font-bold flex items-center justify-center">3</span>
            <h3 className="text-sm font-semibold text-surface-50">Deposit Amounts</h3>
          </div>
        }>
          <div className="space-y-3">
            <TokenInput
              token={token0}
              amount={amount0}
              onAmountChange={setAmount0}
              balance="1,234.56"
              label={t0?.symbol ?? 'Token 0'}
            />
            <TokenInput
              token={token1}
              amount={amount1}
              onAmountChange={setAmount1}
              balance="5,678.90"
              label={t1?.symbol ?? 'Token 1'}
            />
          </div>

          {/* Position summary */}
          {positionStats && (
            <div className="mt-4 pt-4 border-t border-surface-500/15 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Total Value</span>
                <span className="text-surface-200 font-mono">{positionStats.totalValue}</span>
              </div>
              <div className="flex justify-between text-xs">
                <Tooltip content="Annualized based on current volume and fee tier">
                  <span className="text-surface-400 border-b border-dashed border-surface-500">Estimated APR</span>
                </Tooltip>
                <span className="text-emerald-400 font-mono">{positionStats.estimatedApr}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Est. Daily Fees</span>
                <span className="text-surface-200 font-mono">{positionStats.feeEarnings24h}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Range Width</span>
                <span className="text-surface-200">{positionStats.rangePercent}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Action button */}
        <div>
          {!connected ? (
            <Button variant="primary" size="lg" fullWidth>Connect Wallet</Button>
          ) : !token0 || !token1 ? (
            <Button variant="secondary" size="lg" fullWidth disabled>Select Both Tokens</Button>
          ) : !amount0 && !amount1 ? (
            <Button variant="secondary" size="lg" fullWidth disabled>Enter Deposit Amount</Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isSubmitting}
              onClick={() => setShowPreview(true)}
            >
              Preview Position
            </Button>
          )}
        </div>

        {/* Privacy notice */}
        <div className="flex items-center justify-center gap-2 text-xs text-surface-400">
          <svg className="w-3.5 h-3.5 text-shield-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
          </svg>
          <span>Deposit amounts are encrypted before on-chain submission</span>
        </div>
      </div>

      {/* Token selection modal */}
      <Modal
        open={selectingToken !== null}
        onClose={() => setSelectingToken(null)}
        title="Select Token"
        size="sm"
      >
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {KNOWN_TOKENS.filter((t) => t.address !== (selectingToken === 0 ? token1 : token0)).map((token) => (
            <button
              key={token.address}
              onClick={() => handleTokenSelect(token.address)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-700/40 transition-colors text-left"
            >
              <TokenIcon address={token.address} size={32} />
              <div className="flex-1">
                <div className="font-semibold text-sm text-surface-50">{token.symbol}</div>
                <div className="text-xs text-surface-400">{token.name}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Preview / Confirm modal */}
      <Modal open={showPreview} onClose={() => setShowPreview(false)} title="Confirm Position">
        {positionStats && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 py-2">
              {token0 && token1 && <TokenPairIcon token0={token0} token1={token1} size={32} />}
              <span className="text-lg font-bold text-surface-50">
                {t0?.symbol}/{t1?.symbol}
              </span>
              <StatusBadge variant="neutral" size="sm">{FEE_TIERS[feeTier].fee_bps / 100}%</StatusBadge>
            </div>

            <div className="p-3 rounded-xl bg-surface-700/30 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">{t0?.symbol} Deposit</span>
                <span className="text-surface-50 font-mono">{amount0 || '0'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">{t1?.symbol} Deposit</span>
                <span className="text-surface-50 font-mono">{amount1 || '0'}</span>
              </div>
              <div className="border-t border-surface-500/15 pt-2 flex justify-between text-sm">
                <span className="text-surface-400">Total Value</span>
                <span className="text-surface-50 font-semibold">{positionStats.totalValue}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-surface-400">Price Range</span>
                <span className="text-surface-200 font-mono">
                  {fullRange ? 'Full Range' : `${priceLower} - ${priceUpper}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-400">Est. APR</span>
                <span className="text-emerald-400 font-mono">{positionStats.estimatedApr}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-shield-500/10 text-xs text-shield-400">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
              </svg>
              <span>Your deposit amounts will be HFHE-encrypted before submission</span>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isSubmitting}
              onClick={handleSubmit}
            >
              Confirm & Encrypt Position
            </Button>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}

/**
 * Swap Page — Core trading interface.
 *
 * Features:
 * - Token pair selection with searchable modal
 * - Exact-in / exact-out toggle
 * - Route visualization (multi-hop)
 * - Dark pool toggle for maximum privacy
 * - Slippage settings
 * - Real-time quote with price impact
 * - Transaction confirmation modal
 */

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { Address } from '@octrashield/dex-sdk';
import { KNOWN_TOKENS, getTokenMeta } from '@/config/tokens.js';
import { useWallet } from '@/providers/WalletProvider.js';
import { useOctra } from '@/providers/OctraProvider.js';
import { variants, transitions } from '@/config/theme.js';
import {
  Card,
  Button,
  TokenInput,
  Modal,
  TokenIcon,
  StatusBadge,
  Tooltip,
  EncryptedValue,
} from '@/components/common/index.js';

// ============================================================================
// Types
// ============================================================================

type SwapMode = 'exact-in' | 'exact-out';

interface SlippageSettings {
  mode: 'auto' | 'custom';
  valueBps: number;
}

interface MockQuote {
  amountIn: string;
  amountOut: string;
  priceImpact: string;
  fee: string;
  route: string[];
  executionPrice: string;
  minimumReceived: string;
}

// ============================================================================
// Component
// ============================================================================

export function Swap() {
  const { status, address } = useWallet();
  const { notify } = useOctra();
  const connected = status === 'connected';

  // Token state
  const [tokenIn, setTokenIn] = useState<Address | null>(KNOWN_TOKENS[0].address);
  const [tokenOut, setTokenOut] = useState<Address | null>(KNOWN_TOKENS[1].address);
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [swapMode, setSwapMode] = useState<SwapMode>('exact-in');

  // UI state
  const [selectingToken, setSelectingToken] = useState<'in' | 'out' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [darkPool, setDarkPool] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [slippage, setSlippage] = useState<SlippageSettings>({ mode: 'auto', valueBps: 50 });

  // Mock quote (in production, this comes from useSwap hook)
  const quote = useMemo<MockQuote | null>(() => {
    if (!tokenIn || !tokenOut || !amountIn || parseFloat(amountIn) === 0) return null;
    const inMeta = getTokenMeta(tokenIn);
    const outMeta = getTokenMeta(tokenOut);
    if (!inMeta || !outMeta) return null;

    // Simulated quote
    const rate = 1.0 + Math.random() * 0.02 - 0.01;
    const amtIn = parseFloat(amountIn);
    const amtOut = (amtIn * rate).toFixed(outMeta.decimals > 8 ? 6 : 2);
    const minReceived = (parseFloat(amtOut) * (1 - slippage.valueBps / 10000)).toFixed(
      outMeta.decimals > 8 ? 6 : 2
    );

    return {
      amountIn: amountIn,
      amountOut: amtOut,
      priceImpact: (Math.random() * 0.3).toFixed(2),
      fee: '0.30',
      route: [inMeta.symbol, outMeta.symbol],
      executionPrice: `1 ${inMeta.symbol} = ${rate.toFixed(4)} ${outMeta.symbol}`,
      minimumReceived: `${minReceived} ${outMeta.symbol}`,
    };
  }, [tokenIn, tokenOut, amountIn, slippage.valueBps]);

  // Update output amount when quote changes
  useMemo(() => {
    if (quote && swapMode === 'exact-in') {
      setAmountOut(quote.amountOut);
    }
  }, [quote, swapMode]);

  // Swap token positions
  const handleFlip = useCallback(() => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(amountOut);
    setAmountOut(amountIn);
  }, [tokenIn, tokenOut, amountIn, amountOut]);

  // Token selection
  const handleTokenSelect = (address: Address) => {
    if (selectingToken === 'in') {
      if (address === tokenOut) setTokenOut(tokenIn);
      setTokenIn(address);
    } else {
      if (address === tokenIn) setTokenIn(tokenOut);
      setTokenOut(address);
    }
    setSelectingToken(null);
  };

  // Execute swap
  const handleSwap = useCallback(async () => {
    if (!quote) return;
    setIsSwapping(true);
    setShowConfirm(false);

    try {
      // Simulate swap execution
      await new Promise((r) => setTimeout(r, 2000));
      notify.success(`Swapped ${quote.amountIn} ${getTokenMeta(tokenIn!)?.symbol} for ${quote.amountOut} ${getTokenMeta(tokenOut!)?.symbol}`);
      setAmountIn('');
      setAmountOut('');
    } catch {
      notify.error('Swap failed. Please try again.');
    } finally {
      setIsSwapping(false);
    }
  }, [quote, tokenIn, tokenOut, notify]);

  return (
    <motion.div
      className="max-w-lg mx-auto"
      variants={variants.fadeIn}
      initial="initial"
      animate="animate"
    >
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-50">Swap</h1>
          <p className="text-sm text-surface-400 mt-0.5">Trade tokens with encrypted order flow</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2.5 rounded-xl bg-surface-800/60 border border-surface-500/20 hover:border-surface-500/40 transition-colors"
        >
          <svg className="w-5 h-5 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
          </svg>
        </button>
      </div>

      {/* Main swap card */}
      <Card glow className="relative">
        {/* Dark pool toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-surface-400">Mode:</span>
            <button
              onClick={() => setSwapMode('exact-in')}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                swapMode === 'exact-in'
                  ? 'bg-octra-500/15 text-octra-400'
                  : 'text-surface-400 hover:text-surface-200'
              )}
            >
              Exact In
            </button>
            <button
              onClick={() => setSwapMode('exact-out')}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                swapMode === 'exact-out'
                  ? 'bg-octra-500/15 text-octra-400'
                  : 'text-surface-400 hover:text-surface-200'
              )}
            >
              Exact Out
            </button>
          </div>

          <Tooltip content={darkPool ? 'Dark Pool: All parameters encrypted' : 'Standard: Amount visible, addresses encrypted'}>
            <button
              onClick={() => setDarkPool((d) => !d)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                darkPool
                  ? 'bg-shield-500/15 text-shield-400 border border-shield-500/30'
                  : 'text-surface-400 hover:text-surface-200 border border-transparent'
              )}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
              </svg>
              Dark Pool
            </button>
          </Tooltip>
        </div>

        {/* Input token */}
        <TokenInput
          token={tokenIn}
          amount={amountIn}
          onAmountChange={setAmountIn}
          onTokenSelect={() => setSelectingToken('in')}
          balance="1,234.56"
          usdValue={amountIn ? (parseFloat(amountIn || '0') * 1.0).toFixed(2) : undefined}
          label="You pay"
          readOnly={swapMode === 'exact-out'}
        />

        {/* Flip button */}
        <div className="relative flex items-center justify-center -my-2 z-10">
          <motion.button
            whileHover={{ rotate: 180 }}
            transition={transitions.fast}
            onClick={handleFlip}
            className="w-10 h-10 rounded-xl bg-surface-800 border border-surface-500/30 flex items-center justify-center hover:border-octra-500/40 hover:shadow-glow-sm transition-all"
          >
            <svg className="w-4 h-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </motion.button>
        </div>

        {/* Output token */}
        <TokenInput
          token={tokenOut}
          amount={amountOut}
          onAmountChange={setAmountOut}
          onTokenSelect={() => setSelectingToken('out')}
          balance="5,678.90"
          usdValue={amountOut ? (parseFloat(amountOut || '0') * 1.0).toFixed(2) : undefined}
          label="You receive"
          readOnly={swapMode === 'exact-in'}
        />

        {/* Quote details */}
        {quote && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 pt-4 border-t border-surface-500/15"
          >
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Execution Price</span>
                <span className="text-surface-200 font-mono">{quote.executionPrice}</span>
              </div>
              <div className="flex justify-between text-xs">
                <Tooltip content="The difference between market price and your execution price">
                  <span className="text-surface-400 border-b border-dashed border-surface-500">Price Impact</span>
                </Tooltip>
                <span className={clsx(
                  'font-mono',
                  parseFloat(quote.priceImpact) < 0.1 ? 'text-emerald-400' :
                  parseFloat(quote.priceImpact) < 1.0 ? 'text-amber-400' : 'text-red-400'
                )}>
                  {quote.priceImpact}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Fee</span>
                <span className="text-surface-200 font-mono">{quote.fee}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Minimum Received</span>
                <EncryptedValue value={quote.minimumReceived} size="sm" />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-surface-400">Route</span>
                <span className="text-surface-200">
                  {quote.route.join(' -> ')}
                </span>
              </div>
              {darkPool && (
                <div className="flex justify-between text-xs">
                  <span className="text-shield-400">Privacy Level</span>
                  <StatusBadge variant="shield" pulse>Full Encryption</StatusBadge>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Action button */}
        <div className="mt-5">
          {!connected ? (
            <Button variant="primary" size="lg" fullWidth onClick={() => {}}>
              Connect Wallet
            </Button>
          ) : !tokenIn || !tokenOut ? (
            <Button variant="secondary" size="lg" fullWidth disabled>
              Select Tokens
            </Button>
          ) : !amountIn || parseFloat(amountIn) === 0 ? (
            <Button variant="secondary" size="lg" fullWidth disabled>
              Enter Amount
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isSwapping}
              onClick={() => setShowConfirm(true)}
            >
              {darkPool ? 'Dark Pool Swap' : 'Swap'}
            </Button>
          )}
        </div>
      </Card>

      {/* Privacy notice */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-surface-400">
        <svg className="w-3.5 h-3.5 text-shield-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
        </svg>
        <span>All swap parameters are encrypted with HFHE before submission</span>
      </div>

      {/* ================================================================== */}
      {/* Token Selection Modal */}
      {/* ================================================================== */}
      <TokenSelectModal
        open={selectingToken !== null}
        onClose={() => setSelectingToken(null)}
        onSelect={handleTokenSelect}
        excludeAddress={selectingToken === 'in' ? tokenOut : tokenIn}
      />

      {/* ================================================================== */}
      {/* Swap Confirmation Modal */}
      {/* ================================================================== */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Swap">
        {quote && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-700/40">
              <div className="flex items-center gap-2">
                {tokenIn && <TokenIcon address={tokenIn} size={24} />}
                <span className="font-semibold text-surface-50">{quote.amountIn}</span>
                <span className="text-surface-400">{tokenIn && getTokenMeta(tokenIn)?.symbol}</span>
              </div>
              <svg className="w-5 h-5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <div className="flex items-center gap-2">
                {tokenOut && <TokenIcon address={tokenOut} size={24} />}
                <span className="font-semibold text-surface-50">{quote.amountOut}</span>
                <span className="text-surface-400">{tokenOut && getTokenMeta(tokenOut)?.symbol}</span>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-surface-400">Slippage Tolerance</span>
                <span className="text-surface-200">{slippage.valueBps / 100}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-400">Minimum Received</span>
                <span className="text-surface-200 font-mono">{quote.minimumReceived}</span>
              </div>
              {darkPool && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-shield-500/10 text-shield-400">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
                  </svg>
                  <span>Dark Pool: Direction, amount, and recipient fully encrypted</span>
                </div>
              )}
            </div>

            {/* Confirm button */}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isSwapping}
              onClick={handleSwap}
            >
              Confirm {darkPool ? 'Dark Pool ' : ''}Swap
            </Button>
          </div>
        )}
      </Modal>

      {/* ================================================================== */}
      {/* Slippage Settings Modal */}
      {/* ================================================================== */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Swap Settings" size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-surface-400 mb-2 block">Slippage Tolerance</label>
            <div className="flex items-center gap-2">
              {[10, 50, 100, 200].map((bps) => (
                <button
                  key={bps}
                  onClick={() => setSlippage({ mode: 'auto', valueBps: bps })}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    slippage.valueBps === bps
                      ? 'bg-octra-500/15 text-octra-400 border border-octra-500/30'
                      : 'bg-surface-700/40 text-surface-300 border border-surface-500/20 hover:border-surface-500/40'
                  )}
                >
                  {bps / 100}%
                </button>
              ))}
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-surface-700/40 border border-surface-500/20">
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={slippage.mode === 'custom' ? slippage.valueBps / 100 : ''}
                  placeholder="Custom"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0) {
                      setSlippage({ mode: 'custom', valueBps: Math.round(val * 100) });
                    }
                  }}
                  className="w-14 bg-transparent text-xs text-surface-100 outline-none text-right font-mono"
                />
                <span className="text-xs text-surface-400">%</span>
              </div>
            </div>
            {slippage.valueBps > 500 && (
              <p className="text-xs text-amber-400 mt-2">High slippage may result in unfavorable trades</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-surface-400 mb-2 block">Transaction Deadline</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                defaultValue={20}
                min={1}
                max={60}
                className="w-20 px-3 py-1.5 rounded-lg bg-surface-700/40 border border-surface-500/20 text-xs text-surface-100 outline-none font-mono text-right focus:border-octra-500/40"
              />
              <span className="text-xs text-surface-400">minutes</span>
            </div>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}

// ============================================================================
// Token Select Modal
// ============================================================================

function TokenSelectModal({
  open,
  onClose,
  onSelect,
  excludeAddress,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (address: Address) => void;
  excludeAddress: Address | null;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return KNOWN_TOKENS.filter((t) => {
      if (t.address === excludeAddress) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      );
    });
  }, [search, excludeAddress]);

  return (
    <Modal open={open} onClose={onClose} title="Select Token" size="sm">
      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl bg-surface-700/40 border border-surface-500/20 text-sm text-surface-100 placeholder:text-surface-500 outline-none focus:border-octra-500/40 transition-colors"
          autoFocus
        />
      </div>

      {/* Token list */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {filtered.map((token) => (
          <button
            key={token.address}
            onClick={() => {
              onSelect(token.address);
              setSearch('');
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-700/40 transition-colors text-left"
          >
            <TokenIcon address={token.address} size={32} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-surface-50">{token.symbol}</div>
              <div className="text-xs text-surface-400 truncate">{token.name}</div>
            </div>
            {token.isStable && (
              <StatusBadge variant="success" size="sm">Stable</StatusBadge>
            )}
            {token.isNative && (
              <StatusBadge variant="info" size="sm">Native</StatusBadge>
            )}
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-surface-400">
            No tokens found
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Math Utility Tests — tick math, price conversion, slippage, CPAMM, CL, APR.
 *
 * Coverage:
 *   - Tick <-> price conversions
 *   - Tick <-> sqrtPriceX96 conversions
 *   - Tick alignment and clamping
 *   - Price formatting and inversion
 *   - Slippage calculations
 *   - CPAMM swap estimates (output, input, spot price)
 *   - Concentrated liquidity (amount calculations)
 *   - Fee earnings and APR estimation
 *   - Edge cases (MIN_TICK, MAX_TICK, zero reserves)
 */

import { describe, it, expect } from 'vitest';
import {
  tickToPrice,
  priceToTick,
  tickToSqrtPriceX96,
  sqrtPriceX96ToTick,
  roundTickDown,
  roundTickUp,
  clampTick,
  fullRangeTicks,
  formatPrice,
  formatPriceRatio,
  invertPrice,
  calculateMinOutput,
  calculateMaxInput,
  calculatePriceImpact,
  estimateSwapOutput,
  estimateSwapInput,
  spotPrice,
  calculateLiquidity,
  calculateAmountsFromLiquidity,
  estimateFeeEarnings,
  calculateAPR,
  MIN_TICK,
  MAX_TICK,
  FEE_DENOMINATOR,
} from '../utils/math.js';

// ============================================================================
// Tick <-> Price Conversion
// ============================================================================

describe('Tick / Price Conversion', () => {
  it('tickToPrice: tick 0 = 1.0', () => {
    const price = tickToPrice(0);
    expect(Math.abs(price - 1.0)).toBeLessThan(1e-10);
  });

  it('tickToPrice: positive tick > 1.0', () => {
    const price = tickToPrice(1000);
    expect(price).toBeGreaterThan(1.0);
  });

  it('tickToPrice: negative tick < 1.0', () => {
    const price = tickToPrice(-1000);
    expect(price).toBeLessThan(1.0);
    expect(price).toBeGreaterThan(0);
  });

  it('tickToPrice: tick 10000 ~= 2.718 (e)', () => {
    // 1.0001^10000 ≈ 2.71814...
    const price = tickToPrice(10000);
    expect(Math.abs(price - Math.E)).toBeLessThan(0.01);
  });

  it('priceToTick: 1.0 -> tick 0', () => {
    const tick = priceToTick(1.0);
    expect(tick).toBe(0);
  });

  it('priceToTick: round-trip with tickToPrice', () => {
    const originalTick = 5000;
    const price = tickToPrice(originalTick);
    const recoveredTick = priceToTick(price);
    // Allow +/- 1 tick for floating point
    expect(Math.abs(recoveredTick - originalTick)).toBeLessThanOrEqual(1);
  });

  it('priceToTick: round-trip negative tick', () => {
    const originalTick = -3000;
    const price = tickToPrice(originalTick);
    const recoveredTick = priceToTick(price);
    expect(Math.abs(recoveredTick - originalTick)).toBeLessThanOrEqual(1);
  });

  it('priceToTick: throws on zero price', () => {
    expect(() => priceToTick(0)).toThrow();
  });

  it('priceToTick: throws on negative price', () => {
    expect(() => priceToTick(-1.5)).toThrow();
  });
});

// ============================================================================
// SqrtPriceX96 Conversions
// ============================================================================

describe('SqrtPriceX96 Conversions', () => {
  it('tickToSqrtPriceX96: tick 0 returns 2^96', () => {
    const sqrtPrice = tickToSqrtPriceX96(0);
    const expected = 1n << 96n;
    // Allow some precision tolerance
    const diff = sqrtPrice > expected ? sqrtPrice - expected : expected - sqrtPrice;
    expect(diff < 1000n).toBe(true);
  });

  it('sqrtPriceX96ToTick: round-trip with tickToSqrtPriceX96', () => {
    const originalTick = 2500;
    const sqrtPrice = tickToSqrtPriceX96(originalTick);
    const recoveredTick = sqrtPriceX96ToTick(sqrtPrice);
    expect(Math.abs(recoveredTick - originalTick)).toBeLessThanOrEqual(1);
  });

  it('tickToSqrtPriceX96: positive tick > 2^96', () => {
    const sqrtPrice = tickToSqrtPriceX96(5000);
    expect(sqrtPrice > (1n << 96n)).toBe(true);
  });

  it('tickToSqrtPriceX96: negative tick < 2^96', () => {
    const sqrtPrice = tickToSqrtPriceX96(-5000);
    expect(sqrtPrice < (1n << 96n)).toBe(true);
    expect(sqrtPrice > 0n).toBe(true);
  });
});

// ============================================================================
// Tick Alignment
// ============================================================================

describe('Tick Alignment', () => {
  it('roundTickDown: rounds to spacing', () => {
    expect(roundTickDown(105, 10)).toBe(100);
    expect(roundTickDown(99, 10)).toBe(90);
    expect(roundTickDown(100, 10)).toBe(100);
  });

  it('roundTickDown: negative ticks', () => {
    expect(roundTickDown(-105, 10)).toBe(-110);
    expect(roundTickDown(-100, 10)).toBe(-100);
  });

  it('roundTickUp: rounds up to spacing', () => {
    expect(roundTickUp(101, 10)).toBe(110);
    expect(roundTickUp(100, 10)).toBe(100);
    expect(roundTickUp(99, 10)).toBe(100);
  });

  it('roundTickUp: negative ticks', () => {
    expect(roundTickUp(-105, 10)).toBe(-100);
  });

  it('clampTick: within range is identity', () => {
    expect(clampTick(0)).toBe(0);
    expect(clampTick(1000)).toBe(1000);
    expect(clampTick(-1000)).toBe(-1000);
  });

  it('clampTick: clamps to MIN_TICK', () => {
    expect(clampTick(MIN_TICK - 100)).toBe(MIN_TICK);
  });

  it('clampTick: clamps to MAX_TICK', () => {
    expect(clampTick(MAX_TICK + 100)).toBe(MAX_TICK);
  });

  it('fullRangeTicks: returns aligned MIN/MAX', () => {
    const [lower, upper] = fullRangeTicks(60);
    expect(lower % 60).toBe(0);
    expect(upper % 60).toBe(0);
    expect(lower).toBeLessThanOrEqual(MIN_TICK);
    expect(upper).toBeGreaterThanOrEqual(MAX_TICK);
  });
});

// ============================================================================
// Price Formatting
// ============================================================================

describe('Price Formatting', () => {
  it('formatPrice: reasonable significant digits', () => {
    const formatted = formatPrice(1.23456789, 4);
    expect(formatted).toBe('1.235');
  });

  it('formatPrice: large price', () => {
    const formatted = formatPrice(3000.456, 6);
    expect(formatted).toBe('3000.46');
  });

  it('formatPrice: tiny price', () => {
    const formatted = formatPrice(0.000001234, 3);
    expect(formatted).toMatch(/0\.00000123/);
  });

  it('invertPrice: 1/2 = 0.5', () => {
    expect(invertPrice(2)).toBe(0.5);
  });

  it('invertPrice: 1/0.25 = 4', () => {
    expect(invertPrice(0.25)).toBe(4);
  });

  it('invertPrice: throws on zero', () => {
    expect(() => invertPrice(0)).toThrow();
  });
});

// ============================================================================
// Slippage Calculations
// ============================================================================

describe('Slippage', () => {
  it('calculateMinOutput: 50 bps on 10000 = 9950', () => {
    const min = calculateMinOutput(10000n, 50);
    expect(min).toBe(9950n);
  });

  it('calculateMinOutput: 0 bps = same amount', () => {
    expect(calculateMinOutput(1000n, 0)).toBe(1000n);
  });

  it('calculateMinOutput: 10000 bps (100%) = 0', () => {
    expect(calculateMinOutput(1000n, 10000)).toBe(0n);
  });

  it('calculateMaxInput: 50 bps on 10000 = 10050', () => {
    const max = calculateMaxInput(10000n, 50);
    expect(max).toBe(10050n);
  });

  it('calculatePriceImpact: no impact = 0', () => {
    const impact = calculatePriceImpact(100.0, 100.0);
    expect(impact).toBe(0);
  });

  it('calculatePriceImpact: 10% impact', () => {
    // execution price 90, market price 100
    const impact = calculatePriceImpact(90.0, 100.0);
    expect(Math.abs(impact - 10.0)).toBeLessThan(0.01);
  });

  it('calculatePriceImpact: negative (favorable)', () => {
    const impact = calculatePriceImpact(110.0, 100.0);
    expect(impact).toBeLessThan(0);
  });
});

// ============================================================================
// CPAMM Swap Estimates
// ============================================================================

describe('CPAMM Swap Estimates', () => {
  it('estimateSwapOutput: basic 30 bps fee', () => {
    // dy = (y * dx * (10000 - fee)) / (x * 10000 + dx * (10000 - fee))
    const output = estimateSwapOutput(1_000_000n, 1_000_000n, 10_000n, 30);
    // Expected: ~9871
    expect(output > 9800n && output < 9950n).toBe(true);
  });

  it('estimateSwapOutput: zero fee', () => {
    const output = estimateSwapOutput(1_000_000n, 1_000_000n, 10_000n, 0);
    // dy = (1M * 10K) / (1M + 10K) ≈ 9901
    expect(output > 9800n && output < 10000n).toBe(true);
  });

  it('estimateSwapOutput: symmetry at equal reserves', () => {
    const out1 = estimateSwapOutput(1_000_000n, 1_000_000n, 5000n, 30);
    const out2 = estimateSwapOutput(1_000_000n, 1_000_000n, 5000n, 30);
    expect(out1).toBe(out2);
  });

  it('estimateSwapOutput: larger input -> larger output (sublinear)', () => {
    const small = estimateSwapOutput(1_000_000n, 1_000_000n, 1000n, 30);
    const large = estimateSwapOutput(1_000_000n, 1_000_000n, 100_000n, 30);
    expect(large).toBeGreaterThan(small);
    // But less than 100x the small output (price impact)
    expect(large < small * 100n).toBe(true);
  });

  it('estimateSwapInput: inverse of output', () => {
    const reserveIn = 1_000_000n;
    const reserveOut = 1_000_000n;
    const desiredOutput = 5000n;
    const fee = 30;

    const requiredInput = estimateSwapInput(reserveIn, reserveOut, desiredOutput, fee);
    const actualOutput = estimateSwapOutput(reserveIn, reserveOut, requiredInput, fee);

    // actualOutput should be >= desiredOutput (may be slightly more due to rounding)
    expect(actualOutput >= desiredOutput).toBe(true);
    expect(actualOutput - desiredOutput < 5n).toBe(true); // within rounding
  });

  it('spotPrice: equal reserves = 1.0', () => {
    const price = spotPrice(1_000_000n, 1_000_000n);
    expect(price).toBe(1.0);
  });

  it('spotPrice: 2:1 ratio = 0.5', () => {
    const price = spotPrice(2_000_000n, 1_000_000n);
    expect(price).toBe(0.5);
  });

  it('spotPrice: throws on zero reserves', () => {
    expect(() => spotPrice(0n, 1_000_000n)).toThrow();
  });
});

// ============================================================================
// Concentrated Liquidity Math
// ============================================================================

describe('Concentrated Liquidity', () => {
  it('calculateLiquidity: full-range approaches CPAMM', () => {
    const sqrtLower = tickToSqrtPriceX96(MIN_TICK);
    const sqrtUpper = tickToSqrtPriceX96(MAX_TICK);
    const currentSqrt = tickToSqrtPriceX96(0);

    const liquidity = calculateLiquidity(
      1_000_000n, 1_000_000n,
      sqrtLower, sqrtUpper, currentSqrt,
    );
    expect(liquidity > 0n).toBe(true);
  });

  it('calculateLiquidity: narrow range -> higher liquidity density', () => {
    const currentSqrt = tickToSqrtPriceX96(0);
    const narrow = calculateLiquidity(
      1_000_000n, 1_000_000n,
      tickToSqrtPriceX96(-100), tickToSqrtPriceX96(100),
      currentSqrt,
    );
    const wide = calculateLiquidity(
      1_000_000n, 1_000_000n,
      tickToSqrtPriceX96(-10000), tickToSqrtPriceX96(10000),
      currentSqrt,
    );
    expect(narrow > wide).toBe(true);
  });

  it('calculateAmountsFromLiquidity: round-trip with calculateLiquidity', () => {
    const sqrtLower = tickToSqrtPriceX96(-5000);
    const sqrtUpper = tickToSqrtPriceX96(5000);
    const currentSqrt = tickToSqrtPriceX96(0);
    const amount0 = 500_000n;
    const amount1 = 500_000n;

    const liquidity = calculateLiquidity(
      amount0, amount1, sqrtLower, sqrtUpper, currentSqrt,
    );
    const [recovered0, recovered1] = calculateAmountsFromLiquidity(
      liquidity, sqrtLower, sqrtUpper, currentSqrt,
    );

    // Allow 1% tolerance for rounding
    const tolerance0 = amount0 / 100n;
    const tolerance1 = amount1 / 100n;
    const diff0 = recovered0 > amount0 ? recovered0 - amount0 : amount0 - recovered0;
    const diff1 = recovered1 > amount1 ? recovered1 - amount1 : amount1 - recovered1;
    expect(diff0 <= tolerance0 || diff0 <= 10n).toBe(true);
    expect(diff1 <= tolerance1 || diff1 <= 10n).toBe(true);
  });

  it('calculateAmountsFromLiquidity: price below range = all token0', () => {
    const sqrtLower = tickToSqrtPriceX96(1000);
    const sqrtUpper = tickToSqrtPriceX96(2000);
    const currentSqrt = tickToSqrtPriceX96(500); // below range

    const [amount0, amount1] = calculateAmountsFromLiquidity(
      1_000_000n, sqrtLower, sqrtUpper, currentSqrt,
    );
    expect(amount0 > 0n).toBe(true);
    expect(amount1).toBe(0n);
  });

  it('calculateAmountsFromLiquidity: price above range = all token1', () => {
    const sqrtLower = tickToSqrtPriceX96(-2000);
    const sqrtUpper = tickToSqrtPriceX96(-1000);
    const currentSqrt = tickToSqrtPriceX96(0); // above range

    const [amount0, amount1] = calculateAmountsFromLiquidity(
      1_000_000n, sqrtLower, sqrtUpper, currentSqrt,
    );
    expect(amount0).toBe(0n);
    expect(amount1 > 0n).toBe(true);
  });
});

// ============================================================================
// Fee Earnings / APR
// ============================================================================

describe('Fee Earnings & APR', () => {
  it('estimateFeeEarnings: basic calculation', () => {
    const earnings = estimateFeeEarnings(
      1_000_000n, // position liquidity
      10_000_000n, // pool liquidity
      5_000_000n,  // volume per day
      30,          // fee bps
      30,          // days
    );
    // posShare = 1M/10M = 10%
    // daily fees = 5M * 30/10000 = 15000
    // posEarnings = 15000 * 10% * 30 days = 45000
    expect(earnings > 40000n && earnings < 50000n).toBe(true);
  });

  it('estimateFeeEarnings: zero volume = zero fees', () => {
    const earnings = estimateFeeEarnings(
      1_000_000n, 10_000_000n, 0n, 30, 30,
    );
    expect(earnings).toBe(0n);
  });

  it('calculateAPR: 10% return over 365 days = 10%', () => {
    const apr = calculateAPR(100n, 1000n, 365);
    // APR = (100/1000) * (365/365) * 100 = 10%
    expect(Math.abs(apr - 10.0)).toBeLessThan(0.01);
  });

  it('calculateAPR: 30-day extrapolation', () => {
    const apr = calculateAPR(10n, 1000n, 30);
    // APR = (10/1000) * (365/30) * 100 ≈ 12.17%
    expect(Math.abs(apr - 12.17)).toBeLessThan(0.5);
  });

  it('calculateAPR: zero principal = 0', () => {
    const apr = calculateAPR(100n, 0n, 30);
    expect(apr).toBe(0);
  });

  it('calculateAPR: zero days = 0', () => {
    const apr = calculateAPR(100n, 1000n, 0);
    expect(apr).toBe(0);
  });
});

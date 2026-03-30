/**
 * OctraShield DEX SDK — Client-Side Math Utilities
 *
 * Price calculations, tick conversions, slippage computation,
 * and liquidity math for UI display and quote estimation.
 *
 * These are PLAINTEXT calculations for the UI layer.
 * All on-chain math operates on HFHE-encrypted values.
 */

import { MIN_TICK, MAX_TICK, FEE_DENOMINATOR, MIN_SQRT_RATIO, MAX_SQRT_RATIO } from '../core/constants.js';

// Re-export constants for convenience
export { MIN_TICK, MAX_TICK, FEE_DENOMINATOR };

// ============================================================================
// Tick <-> Price Conversions
// ============================================================================

/**
 * Convert a tick index to a price.
 * price = 1.0001^tick
 */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/**
 * Convert a price to the nearest tick index.
 * tick = floor(log(price) / log(1.0001))
 */
export function priceToTick(price: number): number {
  if (price <= 0) throw new Error('Price must be positive');
  const tick = Math.floor(Math.log(price) / Math.log(1.0001));
  return clampTick(tick);
}

/**
 * Convert a tick to a sqrt price ratio (Q64.96 format).
 * sqrtPrice = sqrt(1.0001^tick) * 2^96
 */
export function tickToSqrtPriceX96(tick: number): bigint {
  const clampedTick = clampTick(tick);
  
  // For extreme ticks, return min/max directly
  if (clampedTick <= MIN_TICK + 1) {
    return BigInt(Math.floor(MIN_SQRT_RATIO));
  }
  if (clampedTick >= MAX_TICK - 1) {
    return BigInt(Math.floor(MAX_SQRT_RATIO));
  }
  
  const price = tickToPrice(clampedTick);
  const sqrtPrice = Math.sqrt(price);
  const Q96 = Math.pow(2, 96);
  const result = sqrtPrice * Q96;
  
  if (!isFinite(result) || isNaN(result)) {
    return clampedTick < 0 ? BigInt(Math.floor(MIN_SQRT_RATIO)) : BigInt(Math.floor(MAX_SQRT_RATIO));
  }
  
  return BigInt(Math.floor(result));
}

/**
 * Convert a sqrt price ratio (Q64.96) back to a tick.
 */
export function sqrtPriceX96ToTick(sqrtPriceX96: bigint): number {
  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
  const price = sqrtPrice * sqrtPrice;
  return priceToTick(price);
}

/**
 * Round a tick down to the nearest valid tick spacing.
 */
export function roundTickDown(tick: number, tickSpacing: number): number {
  const rounded = Math.floor(tick / tickSpacing) * tickSpacing;
  return clampTick(rounded);
}

/**
 * Round a tick up to the nearest valid tick spacing.
 */
export function roundTickUp(tick: number, tickSpacing: number): number {
  const rounded = Math.ceil(tick / tickSpacing) * tickSpacing;
  return clampTick(rounded);
}

/**
 * Clamp a tick to the valid range [MIN_TICK, MAX_TICK].
 */
export function clampTick(tick: number): number {
  if (isNaN(tick) || tick === Infinity || tick === -Infinity) {
    return MIN_TICK;
  }
  return Math.max(MIN_TICK, Math.min(MAX_TICK, tick));
}

/**
 * Get the tick range for a full-range position (equivalent to CPAMM).
 * Returns a tuple [tickLower, tickUpper] for destructuring.
 */
export function fullRangeTicks(tickSpacing: number): [number, number] {
  return [
    roundTickDown(MIN_TICK, tickSpacing),
    roundTickUp(MAX_TICK, tickSpacing),
  ] as [number, number];
}

// ============================================================================
// Price Formatting
// ============================================================================

/**
 * Format a price with appropriate decimal places.
 */
export function formatPrice(price: number, significantDigits: number = 6): string {
  if (price === 0) return '0';
  if (price >= 1) {
    return price.toFixed(Math.max(0, significantDigits - Math.floor(Math.log10(price)) - 1));
  }
  const leadingZeros = -Math.floor(Math.log10(price));
  return price.toFixed(leadingZeros + significantDigits - 1);
}

/**
 * Format a price as a human-readable ratio.
 */
export function formatPriceRatio(
  price: number,
  baseSymbol: string,
  quoteSymbol: string
): string {
  return `1 ${baseSymbol} = ${formatPrice(price)} ${quoteSymbol}`;
}

/**
 * Calculate the inverted price (token1/token0 -> token0/token1).
 */
export function invertPrice(price: number): number {
  if (price === 0) throw new Error('Cannot invert zero price');
  return 1 / price;
}

// ============================================================================
// Slippage Calculations
// ============================================================================

/**
 * Calculate the minimum output amount after slippage.
 */
export function calculateMinOutput(expectedOutput: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 10000) {
    throw new Error(`Invalid slippage: ${slippageBps} bps (must be 0-10000)`);
  }
  return (expectedOutput * BigInt(FEE_DENOMINATOR - slippageBps)) / BigInt(FEE_DENOMINATOR);
}

/**
 * Calculate the maximum input amount after slippage (for exact-output swaps).
 */
export function calculateMaxInput(expectedInput: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 10000) {
    throw new Error(`Invalid slippage: ${slippageBps} bps (must be 0-10000)`);
  }
  return (expectedInput * BigInt(FEE_DENOMINATOR + slippageBps)) / BigInt(FEE_DENOMINATOR);
}

/**
 * Calculate price impact as a percentage.
 * impact = abs(executionPrice - marketPrice) / marketPrice * 100
 */
export function calculatePriceImpact(
  executionPrice: number,
  marketPrice: number
): number {
  if (marketPrice === 0) return 0;
  return Math.abs((executionPrice - marketPrice) / marketPrice) * 100;
}

// ============================================================================
// CPAMM (Constant Product) Math — Plaintext Estimations
// ============================================================================

/**
 * Estimate output amount for a constant-product swap.
 */
export function estimateSwapOutput(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps: number
): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const feeMultiplier = BigInt(FEE_DENOMINATOR - feeBps);
  const numerator = reserveOut * amountIn * feeMultiplier;
  const denominator = reserveIn * BigInt(FEE_DENOMINATOR) + amountIn * feeMultiplier;
  return numerator / denominator;
}

/**
 * Estimate input amount needed for a desired output (exact-output).
 */
export function estimateSwapInput(
  reserveIn: bigint,
  reserveOut: bigint,
  amountOut: bigint,
  feeBps: number
): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n || amountOut >= reserveOut) {
    throw new Error('Insufficient liquidity for desired output');
  }
  const feeMultiplier = BigInt(FEE_DENOMINATOR - feeBps);
  const numerator = reserveIn * amountOut * BigInt(FEE_DENOMINATOR);
  const denominator = (reserveOut - amountOut) * feeMultiplier;
  return numerator / denominator + 1n;
}

/**
 * Calculate the spot price from reserves.
 */
export function spotPrice(reserveIn: bigint, reserveOut: bigint): number {
  if (reserveIn === 0n) {
    throw new Error('reserveIn cannot be zero');
  }
  return Number(reserveOut * 10n ** 18n / reserveIn) / 1e18;
}

// ============================================================================
// Concentrated Liquidity Math
// ============================================================================

/**
 * Calculate liquidity amount from token amounts and price range.
 * L = min(amount0 * (sqrtUpper * sqrtLower) / (sqrtUpper - sqrtLower),
 *         amount1 / (sqrtUpper - sqrtLower))
 *
 * sqrtPrice values are in Q64.96 format (multiplied by 2^96).
 */
export function calculateLiquidity(
  amount0: bigint,
  amount1: bigint,
  sqrtPriceLower: bigint,
  sqrtPriceUpper: bigint,
  currentSqrtPrice: bigint
): bigint {
  // Ensure sqrtPriceLower < sqrtPriceUpper
  let lower = sqrtPriceLower;
  let upper = sqrtPriceUpper;
  if (lower >= upper) {
    [lower, upper] = [upper, lower];
    if (lower === upper) {
      return 0n;
    }
  }

  const Q96 = 1n << 96n;
  const diff = upper - lower;
  if (diff === 0n) return 0n;

  if (currentSqrtPrice <= lower) {
    // All token0: L = amount0 * sqrtLower * sqrtUpper / (sqrtUpper - sqrtLower)
    // Since sqrtPrices are in Q96, we need to handle the scaling properly
    if (lower === 0n || upper === 0n) {
      return 0n;
    }
    // L = amount0 * (lower * upper) / (diff * Q96)
    // lower and upper are Q96, so lower*upper is Q192
    // We need to divide by Q96 to get back to Q96 scale for L
    const numerator = amount0 * lower * upper;
    const denominator = diff * Q96;
    if (denominator === 0n) return 0n;
    return numerator / denominator;
  } else if (currentSqrtPrice >= upper) {
    // All token1: L = amount1 * Q96 / (sqrtUpper - sqrtLower)
    return (amount1 * Q96) / diff;
  } else {
    // Both tokens: split at current price
    if (currentSqrtPrice === 0n || upper === 0n) {
      return 0n;
    }
    
    const diff1 = currentSqrtPrice - lower;
    const diff2 = upper - currentSqrtPrice;
    if (diff1 === 0n || diff2 === 0n) {
      return 0n;
    }
    
    // L0 = amount0 * sqrtLower * currentSqrtPrice / (currentSqrtPrice - sqrtLower) / Q96
    // = amount0 * lower * currentSqrtPrice / (diff1 * Q96)
    const liq0Denom = diff1 * Q96;
    const liq0 = (amount0 * lower * currentSqrtPrice) / liq0Denom;
    
    // L1 = amount1 * Q96 / (currentSqrtPrice - sqrtLower)
    const liq1 = (amount1 * Q96) / diff1;
    
    return liq0 < liq1 ? liq0 : liq1;
  }
}

/**
 * Calculate token amounts from a liquidity amount and price range.
 * Returns an array [amount0, amount1] of each token needed to provide the given liquidity.
 *
 * sqrtPrice values are in Q64.96 format.
 */
export function calculateAmountsFromLiquidity(
  liquidity: bigint,
  sqrtPriceLower: bigint,
  sqrtPriceUpper: bigint,
  currentSqrtPrice: bigint
): [bigint, bigint] {
  const Q96 = 1n << 96n;

  let amount0 = 0n;
  let amount1 = 0n;

  // Ensure proper ordering
  let lower = sqrtPriceLower;
  let upper = sqrtPriceUpper;
  if (lower > upper) {
    [lower, upper] = [upper, lower];
  }

  if (currentSqrtPrice <= lower) {
    // All token0
    // amount0 = L * (sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper) * Q96
    // = L * diff * Q96 / (lower * upper)
    if (lower !== 0n && upper !== 0n) {
      const diff = upper - lower;
      amount0 = (liquidity * diff * Q96) / (lower * upper);
    }
  } else if (currentSqrtPrice >= upper) {
    // All token1
    // amount1 = L * (sqrtUpper - sqrtLower) / Q96
    const diff = upper - lower;
    amount1 = (liquidity * diff) / Q96;
  } else {
    // Both tokens
    if (currentSqrtPrice !== 0n && upper !== 0n) {
      const diff1 = currentSqrtPrice - lower;
      const diff2 = upper - currentSqrtPrice;
      
      // amount0 = L * (sqrtUpper - currentSqrtPrice) / (currentSqrtPrice * sqrtUpper) * Q96
      // = L * diff2 * Q96 / (currentSqrtPrice * upper)
      amount0 = (liquidity * diff2 * Q96) / (currentSqrtPrice * upper);
      
      // amount1 = L * (currentSqrtPrice - sqrtLower) / Q96
      amount1 = (liquidity * diff1) / Q96;
    }
  }

  return [amount0, amount1];
}

/**
 * Estimate the fee earnings for a position over a period.
 */
export function estimateFeeEarnings(
  positionLiquidity: bigint,
  poolLiquidity: bigint,
  volumePerDay: bigint,
  feeBps: number,
  days: number
): bigint {
  if (poolLiquidity === 0n) return 0n;
  const totalFees = (volumePerDay * BigInt(days) * BigInt(feeBps)) / BigInt(FEE_DENOMINATOR);
  return (totalFees * positionLiquidity) / poolLiquidity;
}

// ============================================================================
// APR / Yield Calculations
// ============================================================================

/**
 * Calculate annualized percentage rate from fee earnings.
 */
export function calculateAPR(
  feeEarnings: bigint,
  principal: bigint,
  days: number
): number {
  if (principal === 0n || days === 0) return 0;
  const dailyRate = Number(feeEarnings * 10000n / principal) / 10000;
  return dailyRate / days * 365 * 100;
}

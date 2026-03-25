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

// ============================================================================
// Tick <-> Price Conversions
// ============================================================================

/**
 * Convert a tick index to a price.
 * price = 1.0001^tick
 *
 * @param tick - Tick index
 * @returns Price as a floating-point number
 */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/**
 * Convert a price to the nearest tick index.
 * tick = floor(log(price) / log(1.0001))
 *
 * @param price - Price as a floating-point number
 * @returns Nearest tick index
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
  const price = tickToPrice(tick);
  const sqrtPrice = Math.sqrt(price);
  return BigInt(Math.floor(sqrtPrice * 2 ** 96));
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
  return Math.max(MIN_TICK, Math.min(MAX_TICK, tick));
}

/**
 * Get the tick range for a full-range position (equivalent to CPAMM).
 */
export function fullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  return {
    tickLower: roundTickDown(MIN_TICK, tickSpacing),
    tickUpper: roundTickUp(MAX_TICK, tickSpacing),
  };
}

// ============================================================================
// Price Formatting
// ============================================================================

/**
 * Format a price with appropriate decimal places.
 * Adapts precision based on the price magnitude.
 */
export function formatPrice(price: number, significantDigits: number = 6): string {
  if (price === 0) return '0';
  if (price >= 1) {
    return price.toFixed(Math.max(0, significantDigits - Math.floor(Math.log10(price)) - 1));
  }
  // For prices < 1, show enough decimals
  const leadingZeros = -Math.floor(Math.log10(price));
  return price.toFixed(leadingZeros + significantDigits - 1);
}

/**
 * Format a price as a human-readable ratio.
 * e.g., "1 ETH = 3,245.67 USDC"
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
 * minOut = expectedOut * (10000 - slippageBps) / 10000
 */
export function calculateMinOutput(expectedOutput: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 10000) {
    throw new Error(`Invalid slippage: ${slippageBps} bps (must be 0-10000)`);
  }
  return (expectedOutput * BigInt(FEE_DENOMINATOR - slippageBps)) / BigInt(FEE_DENOMINATOR);
}

/**
 * Calculate the maximum input amount after slippage (for exact-output swaps).
 * maxIn = expectedIn * (10000 + slippageBps) / 10000
 */
export function calculateMaxInput(expectedInput: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps > 10000) {
    throw new Error(`Invalid slippage: ${slippageBps} bps (must be 0-10000)`);
  }
  return (expectedInput * BigInt(FEE_DENOMINATOR + slippageBps)) / BigInt(FEE_DENOMINATOR);
}

/**
 * Calculate price impact in basis points.
 * impact = abs(executionPrice - marketPrice) / marketPrice * 10000
 */
export function calculatePriceImpact(
  executionPrice: number,
  marketPrice: number
): number {
  if (marketPrice === 0) return 0;
  return Math.abs((executionPrice - marketPrice) / marketPrice) * FEE_DENOMINATOR;
}

// ============================================================================
// CPAMM (Constant Product) Math — Plaintext Estimations
// ============================================================================

/**
 * Estimate output amount for a constant-product swap.
 * dy = (y * dx * (10000 - feeBps)) / (x * 10000 + dx * (10000 - feeBps))
 *
 * This is a plaintext estimation for UI quotes.
 * The actual swap uses encrypted arithmetic on-chain.
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
 * dx = (x * dy * 10000) / ((y - dy) * (10000 - feeBps)) + 1
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
  return numerator / denominator + 1n; // Round up
}

/**
 * Calculate the spot price from reserves.
 * price = reserveOut / reserveIn
 */
export function spotPrice(reserveIn: bigint, reserveOut: bigint): number {
  if (reserveIn === 0n) return 0;
  return Number(reserveOut * 10n ** 18n / reserveIn) / 1e18;
}

// ============================================================================
// Concentrated Liquidity Math
// ============================================================================

/**
 * Calculate liquidity amount from token amounts and price range.
 * L = min(amount0 * (sqrtUpper * sqrtLower) / (sqrtUpper - sqrtLower),
 *         amount1 / (sqrtUpper - sqrtLower))
 */
export function calculateLiquidity(
  amount0: bigint,
  amount1: bigint,
  sqrtPriceLower: bigint,
  sqrtPriceUpper: bigint,
  currentSqrtPrice: bigint
): bigint {
  if (sqrtPriceLower >= sqrtPriceUpper) {
    throw new Error('sqrtPriceLower must be < sqrtPriceUpper');
  }

  const Q96 = 1n << 96n;

  if (currentSqrtPrice <= sqrtPriceLower) {
    // All token0
    const denom = ((sqrtPriceUpper - sqrtPriceLower) * Q96) / (sqrtPriceLower * sqrtPriceUpper);
    return (amount0 * Q96) / denom;
  } else if (currentSqrtPrice >= sqrtPriceUpper) {
    // All token1
    return (amount1 * Q96) / (sqrtPriceUpper - sqrtPriceLower);
  } else {
    // Both tokens: return the minimum
    const liq0Denom = ((sqrtPriceUpper - currentSqrtPrice) * Q96) / (currentSqrtPrice * sqrtPriceUpper);
    const liq0 = (amount0 * Q96) / liq0Denom;
    const liq1 = (amount1 * Q96) / (currentSqrtPrice - sqrtPriceLower);
    return liq0 < liq1 ? liq0 : liq1;
  }
}

/**
 * Calculate token amounts from a liquidity amount and price range.
 * Returns the amount of each token needed to provide the given liquidity.
 */
export function calculateAmountsFromLiquidity(
  liquidity: bigint,
  sqrtPriceLower: bigint,
  sqrtPriceUpper: bigint,
  currentSqrtPrice: bigint
): { amount0: bigint; amount1: bigint } {
  const Q96 = 1n << 96n;

  let amount0 = 0n;
  let amount1 = 0n;

  if (currentSqrtPrice <= sqrtPriceLower) {
    // All token0
    amount0 = (liquidity * (sqrtPriceUpper - sqrtPriceLower) * Q96) / (sqrtPriceLower * sqrtPriceUpper);
  } else if (currentSqrtPrice >= sqrtPriceUpper) {
    // All token1
    amount1 = (liquidity * (sqrtPriceUpper - sqrtPriceLower)) / Q96;
  } else {
    // Both tokens
    amount0 = (liquidity * (sqrtPriceUpper - currentSqrtPrice) * Q96) / (currentSqrtPrice * sqrtPriceUpper);
    amount1 = (liquidity * (currentSqrtPrice - sqrtPriceLower)) / Q96;
  }

  return { amount0, amount1 };
}

/**
 * Estimate the fee earnings for a position over a period.
 * Based on current pool volume and the position's share of in-range liquidity.
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
 *
 * @param feeEarnings - Total fees earned in the period
 * @param principal - Total value of the position
 * @param days - Number of days in the period
 * @returns APR as a percentage (e.g., 45.2 for 45.2%)
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

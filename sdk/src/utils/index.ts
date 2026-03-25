/**
 * @octrashield/dex-sdk/utils
 *
 * Utility modules: encoding, math, and routing.
 */

// Encoding
export {
  toHex,
  fromHex,
  toHexPrefixed,
  stripHexPrefix,
  toBase64,
  fromBase64,
  isValidAddress,
  toAddress,
  ZERO_ADDRESS,
  isZeroAddress,
  truncateAddress,
  computePoolId,
  sortTokens,
  bigintToBytes,
  bytesToBigint,
  bigintToString,
  stringToBigint,
  formatAmount,
  parseAmount,
  concatBytes,
} from './encoding.js';

// Math
export {
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
} from './math.js';

// Routing
export { SwapRouter, formatRoute, comparRoutes } from './routing.js';

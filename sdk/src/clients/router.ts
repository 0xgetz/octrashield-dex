/**
 * Router Client — Multi-Hop Encrypted Swap Execution & Dark Pool
 *
 * Client for the OctraShieldRouter contract.
 * Handles swap quoting, route encoding, multi-hop execution,
 * and the fully-encrypted dark pool entry point.
 *
 * Usage:
 * ```ts
 * const router = new RouterClient(txBuilder, hfheKeyPair, routerAddress);
 * const quote = await router.quoteExactInput(route, amountIn);
 * const result = await router.swapExactInput({ route, amountIn, ... });
 * await router.darkPoolSwap(darkParams);
 * ```
 */

import type { TransactionBuilder } from '../core/ocs01.js';
import type {
  Address,
  EncryptedU64,
  HfheKeyPair,
  SwapRoute,
  SwapHop,
  ExactInputParams,
  ExactOutputParams,
  DarkPoolSwapParams,
  SwapResult,
  SwapQuote,
  TransactionReceipt,
} from '../core/types.js';
import { encrypt, decryptValue } from '../core/hfhe.js';
import {
  DEFAULT_SLIPPAGE_BPS,
  DEFAULT_DEADLINE_SECONDS,
  MAX_SWAP_HOPS,
  FEE_DENOMINATOR,
} from '../core/constants.js';
import {
  SlippageExceeded,
  MaxHopsExceeded,
  RouteNotFound,
} from '../core/errors.js';
import { calculateMinOutput, calculateMaxInput } from '../utils/math.js';

export class RouterClient {
  constructor(
    private readonly tx: TransactionBuilder,
    private readonly keyPair: HfheKeyPair,
    private readonly routerAddress: Address
  ) {}

  // --------------------------------------------------------------------------
  // Quoting (View Methods — no gas, no signing)
  // --------------------------------------------------------------------------

  /**
   * Get a quote for an exact-input swap.
   * Simulates the swap on-chain to get an accurate output estimate.
   *
   * @param route - The swap route to quote
   * @param amountIn - Exact input amount
   * @returns Swap quote with expected output and price impact
   */
  async quoteExactInput(route: SwapRoute, amountIn: bigint): Promise<SwapQuote> {
    this.validateRoute(route);

    const encAmountIn = encrypt(amountIn, this.keyPair);
    const encodedPath = this.encodeRoutePath(route);

    const result = await this.tx.viewCall<{
      amountOut: string;
      priceImpactBps: number;
      gasEstimate: string;
    }>(
      this.routerAddress,
      'view_quote_exact_input',
      [encodedPath, encAmountIn.ciphertext]
    );

    return {
      route,
      amountIn,
      expectedAmountOut: BigInt(result.amountOut),
      priceImpactBps: result.priceImpactBps,
      totalFeeBps: route.totalFeeBps,
      estimatedGas: BigInt(result.gasEstimate),
      deadline: BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS),
    };
  }

  /**
   * Get a quote for an exact-output swap.
   *
   * @param route - The swap route to quote
   * @param amountOut - Desired output amount
   * @returns Swap quote with required input amount
   */
  async quoteExactOutput(route: SwapRoute, amountOut: bigint): Promise<SwapQuote> {
    this.validateRoute(route);

    const encAmountOut = encrypt(amountOut, this.keyPair);
    const encodedPath = this.encodeRoutePath(route);

    const result = await this.tx.viewCall<{
      amountIn: string;
      priceImpactBps: number;
      gasEstimate: string;
    }>(
      this.routerAddress,
      'view_quote_exact_output',
      [encodedPath, encAmountOut.ciphertext]
    );

    return {
      route,
      amountIn: BigInt(result.amountIn),
      expectedAmountOut: amountOut,
      priceImpactBps: result.priceImpactBps,
      totalFeeBps: route.totalFeeBps,
      estimatedGas: BigInt(result.gasEstimate),
      deadline: BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS),
    };
  }

  // --------------------------------------------------------------------------
  // Swap Execution (Call Methods — signed, state-mutating)
  // --------------------------------------------------------------------------

  /**
   * Execute an exact-input swap.
   *
   * "I want to spend exactly `amountIn` of tokenIn and receive
   *  at least `amountOutMinimum` of tokenOut."
   *
   * All amounts are encrypted before submission to the contract.
   *
   * @param params - Exact input swap parameters
   * @returns Swap result with actual amounts
   */
  async swapExactInput(params: ExactInputParams): Promise<SwapResult> {
    this.validateRoute(params.route);

    const encAmountIn = encrypt(params.amountIn, this.keyPair);
    const encMinOut = encrypt(params.amountOutMinimum, this.keyPair);
    const encodedPath = this.encodeRoutePath(params.route);

    const receipt = await this.tx.callTransaction(
      this.routerAddress,
      'call_swap_exact_input',
      [
        encodedPath,
        encAmountIn.ciphertext,
        encMinOut.ciphertext,
        params.recipient,
        params.deadline,
      ]
    );

    return this.parseSwapResult(receipt, params.route);
  }

  /**
   * Execute an exact-output swap.
   *
   * "I want to receive exactly `amountOut` of tokenOut and spend
   *  at most `amountInMaximum` of tokenIn."
   *
   * @param params - Exact output swap parameters
   * @returns Swap result with actual amounts
   */
  async swapExactOutput(params: ExactOutputParams): Promise<SwapResult> {
    this.validateRoute(params.route);

    const encAmountOut = encrypt(params.amountOut, this.keyPair);
    const encMaxIn = encrypt(params.amountInMaximum, this.keyPair);
    const encodedPath = this.encodeRoutePath(params.route);

    const receipt = await this.tx.callTransaction(
      this.routerAddress,
      'call_swap_exact_output',
      [
        encodedPath,
        encAmountOut.ciphertext,
        encMaxIn.ciphertext,
        params.recipient,
        params.deadline,
      ]
    );

    return this.parseSwapResult(receipt, params.route);
  }

  // --------------------------------------------------------------------------
  // Dark Pool Swap — Fully Encrypted
  // --------------------------------------------------------------------------

  /**
   * Execute a dark pool swap where ALL parameters are encrypted.
   *
   * Unlike regular swaps where the route path is public, a dark pool swap
   * encrypts the pool selector, direction, amount, minimum output, AND
   * recipient. Zero information leakage to observers.
   *
   * @param params - Dark pool swap parameters (all encrypted)
   * @returns Transaction receipt
   */
  async darkPoolSwap(params: DarkPoolSwapParams): Promise<TransactionReceipt> {
    return this.tx.callTransaction(
      this.routerAddress,
      'call_dark_pool_swap',
      [
        params.encryptedPoolSelector.ciphertext,
        params.encryptedDirection.ciphertext,
        params.encryptedAmount.ciphertext,
        params.encryptedMinOutput.ciphertext,
        params.encryptedRecipient.ciphertext,
        params.deadline,
      ]
    );
  }

  /**
   * Build dark pool swap parameters from plaintext values.
   * Encrypts all fields client-side.
   *
   * @param poolIndex - Index of the target pool (encrypted)
   * @param zeroForOne - true = token0->token1, false = token1->token0 (encrypted)
   * @param amount - Swap amount (encrypted)
   * @param minOutput - Minimum output (encrypted)
   * @param recipient - Recipient address encoded as uint (encrypted)
   * @param deadline - Deadline block number (public)
   * @returns Fully encrypted dark pool swap parameters
   */
  buildDarkPoolParams(
    poolIndex: bigint,
    zeroForOne: boolean,
    amount: bigint,
    minOutput: bigint,
    recipient: bigint,
    deadline: bigint
  ): DarkPoolSwapParams {
    return {
      encryptedPoolSelector: encrypt(poolIndex, this.keyPair),
      encryptedDirection: encrypt(zeroForOne ? 1n : 0n, this.keyPair),
      encryptedAmount: encrypt(amount, this.keyPair),
      encryptedMinOutput: encrypt(minOutput, this.keyPair),
      encryptedRecipient: encrypt(recipient, this.keyPair),
      deadline,
    };
  }

  // --------------------------------------------------------------------------
  // Convenience Methods
  // --------------------------------------------------------------------------

  /**
   * Simple swap: find route, get quote, execute with slippage protection.
   * One-call convenience for the most common swap pattern.
   *
   * @param tokenIn - Input token address
   * @param tokenOut - Output token address
   * @param amountIn - Amount to swap
   * @param slippageBps - Slippage tolerance in basis points (default: 50 = 0.5%)
   * @param route - Pre-computed route (optional, will quote if provided)
   * @returns Swap result
   */
  async simpleSwap(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    slippageBps: number = DEFAULT_SLIPPAGE_BPS,
    route?: SwapRoute
  ): Promise<SwapResult> {
    if (!route) {
      throw new RouteNotFound(tokenIn as string, tokenOut as string);
    }

    // Get quote for output estimation
    const quote = await this.quoteExactInput(route, amountIn);

    // Apply slippage to get minimum output
    const minOutput = calculateMinOutput(quote.expectedAmountOut, slippageBps);

    const signer = this.tx.getSignerAddress();

    return this.swapExactInput({
      route,
      amountIn,
      amountOutMinimum: minOutput,
      recipient: signer,
      deadline: quote.deadline,
    });
  }

  /**
   * Multi-route swap: split an order across multiple routes for better execution.
   * Useful for large orders to minimize price impact.
   *
   * @param routes - Array of routes with their allocation percentages
   * @param totalAmountIn - Total amount to swap
   * @param slippageBps - Slippage tolerance
   * @returns Array of swap results
   */
  async splitSwap(
    routes: Array<{ route: SwapRoute; allocationBps: number }>,
    totalAmountIn: bigint,
    slippageBps: number = DEFAULT_SLIPPAGE_BPS
  ): Promise<SwapResult[]> {
    // Validate allocations sum to 10000 bps (100%)
    const totalAllocation = routes.reduce((sum, r) => sum + r.allocationBps, 0);
    if (totalAllocation !== FEE_DENOMINATOR) {
      throw new Error(`Allocations must sum to ${FEE_DENOMINATOR} bps, got ${totalAllocation}`);
    }

    const results: SwapResult[] = [];

    for (const { route, allocationBps } of routes) {
      const amountIn = (totalAmountIn * BigInt(allocationBps)) / BigInt(FEE_DENOMINATOR);
      const quote = await this.quoteExactInput(route, amountIn);
      const minOutput = calculateMinOutput(quote.expectedAmountOut, slippageBps);
      const signer = this.tx.getSignerAddress();

      const result = await this.swapExactInput({
        route,
        amountIn,
        amountOutMinimum: minOutput,
        recipient: signer,
        deadline: quote.deadline,
      });

      results.push(result);
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Encode a swap route as a path for the on-chain router.
   * Format: [token0][feeTier][token1][feeTier][token2]...
   */
  private encodeRoutePath(route: SwapRoute): string {
    if (route.hops.length === 0) return '';

    let path = route.hops[0].tokenIn as string;
    for (const hop of route.hops) {
      path += hop.feeTier.toString().padStart(2, '0');
      path += hop.tokenOut as string;
    }
    return path;
  }

  /**
   * Parse swap result from transaction receipt events.
   */
  private parseSwapResult(receipt: TransactionReceipt, route: SwapRoute): SwapResult {
    const swapEvent = receipt.events.find(e => e.name === 'SwapExecuted');

    const amountIn = (swapEvent?.data?.amountIn || { ciphertext: '0' as any, noiseBudget: 0 }) as EncryptedU64;
    const amountOut = (swapEvent?.data?.amountOut || { ciphertext: '0' as any, noiseBudget: 0 }) as EncryptedU64;

    return {
      amountIn,
      amountOut,
      executedRoute: route,
      effectivePrice: 0n, // Would be computed from decrypted amounts
      txReceipt: receipt,
    };
  }

  /**
   * Validate a swap route.
   */
  private validateRoute(route: SwapRoute): void {
    if (route.hops.length === 0) {
      throw new RouteNotFound('empty', 'empty');
    }
    if (route.hops.length > MAX_SWAP_HOPS) {
      throw new MaxHopsExceeded(route.hops.length, MAX_SWAP_HOPS);
    }
  }
}

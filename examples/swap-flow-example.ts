/**
 * Complete Swap Flow Example using Mock OctraShield SDK
 * 
 * This example demonstrates a full token swap workflow:
 * 1. Setup: Initialize transaction builder and clients
 * 2. Check balances and allowances
 * 3. Find or create a pool
 * 4. Get a swap quote
 * 5. Execute the swap
 * 6. Verify the results
 * 
 * Run with: npx tsx examples/swap-flow-example.ts
 */

import {
  MockTransactionBuilder,
  MockFactoryClient,
  MockRouterClient,
  MockShieldTokenClient,
  createMockTransactionBuilder,
  createMockKeyPair,
  createMockFactoryClient,
  createMockRouterClient,
  createMockShieldTokenClient,
  mockAddress,
  type SwapRoute,
  type SwapQuote,
  type SwapResult,
} from '../mock-octra-sdk/src/index.js';

import {
  generateKeyPair,
  encrypt,
  decrypt,
  DEFAULT_NOISE_BUDGET,
} from '../mock-octra-hfhe/src/index.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  network: 'testnet' as const,
  tokenAAddress: mockAddress('USDC'),
  tokenBAddress: mockAddress('WETH'),
  swapAmount: 1000000n, // 1 USDC (6 decimals)
  slippageBps: 50, // 0.5% slippage tolerance
  deadlineSeconds: 1200, // 20 minutes
  feeTier: 2, // 0.05% fee tier
};

// ============================================================================
// Helper Functions
// ============================================================================

function logStep(step: number, message: string): void {
  console.log(`\n[${step}] ${message}`);
  console.log('─'.repeat(60));
}

function logResult(message: string, value?: unknown): void {
  if (value !== undefined) {
    console.log(`  ${message}:`, value);
  } else {
    console.log(`  ${message}`);
  }
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

function formatAmount(amount: bigint, decimals: number = 18): string {
  const str = amount.toString();
  if (decimals === 0) return str;
  const padded = str.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals) || '0';
  const decPart = padded.slice(-decimals);
  return `${intPart}.${decPart}`;
}

// ============================================================================
// Main Swap Flow
// ============================================================================

async function executeSwapFlow(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     OctraShield Mock SDK - Complete Swap Flow Example       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // --------------------------------------------------------------------------
  // Step 1: Initialize Infrastructure
  // --------------------------------------------------------------------------
  
  logStep(1, 'Initialize Transaction Builder and Clients');
  
  // Create transaction builder
  const txBuilder = createMockTransactionBuilder({
    network: CONFIG.network,
  });
  await txBuilder.initialize();
  
  const signerAddress = txBuilder.getSignerAddress();
  logResult('Signer address', formatAddress(signerAddress));
  logResult('Network', CONFIG.network);
  
  // Generate encryption keypair
  const keyPair = createMockKeyPair();
  logResult('Key fingerprint', keyPair.fingerprint);
  
  // Create clients
  const factory = createMockFactoryClient(txBuilder);
  const router = createMockRouterClient(txBuilder, keyPair);
  const tokenA = createMockShieldTokenClient(txBuilder, keyPair, CONFIG.tokenAAddress);
  const tokenB = createMockShieldTokenClient(txBuilder, keyPair, CONFIG.tokenBAddress);
  
  logResult('Factory address', formatAddress(mockAddress('factory')));
  logResult('Router address', formatAddress(mockAddress('router')));
  logResult('Token A (USDC)', formatAddress(CONFIG.tokenAAddress));
  logResult('Token B (WETH)', formatAddress(CONFIG.tokenBAddress));

  // --------------------------------------------------------------------------
  // Step 2: Check Token Balances
  // --------------------------------------------------------------------------
  
  logStep(2, 'Check Token Balances');
  
  const balanceA = await tokenA.getMyBalance();
  const balanceB = await tokenB.getMyBalance();
  
  logResult('Token A balance', `${formatAmount(balanceA.plaintext, 6)} USDC`);
  logResult('Token B balance', `${formatAmount(balanceB.plaintext, 18)} WETH`);
  
  // Verify sufficient balance
  if (balanceA.plaintext < CONFIG.swapAmount) {
    throw new Error(`Insufficient Token A balance: need ${CONFIG.swapAmount}, have ${balanceA.plaintext}`);
  }
  logResult('Balance check', 'PASSED ✓');

  // --------------------------------------------------------------------------
  // Step 3: Check and Set Allowances
  // --------------------------------------------------------------------------
  
  logStep(3, 'Check and Set Allowances');
  
  const routerAddress = mockAddress('router');
  
  // Check current allowance
  const currentAllowance = await tokenA.getAllowance(signerAddress, routerAddress);
  const allowanceValue = tokenA.decryptAllowance(currentAllowance);
  logResult('Current allowance', allowanceValue >= CONFIG.swapAmount ? 'Sufficient' : 'Insufficient');
  
  // Ensure sufficient allowance
  if (allowanceValue < CONFIG.swapAmount) {
    logResult('Approving router...', '');
    const approveReceipt = await tokenA.approveMax(routerAddress);
    logResult('Approval TX', formatAddress(approveReceipt.txHash));
    logResult('Approval status', approveReceipt.status);
  } else {
    logResult('Allowance already sufficient', '');
  }

  // --------------------------------------------------------------------------
  // Step 4: Find or Create Pool
  // --------------------------------------------------------------------------
  
  logStep(4, 'Find or Create Pool');
  
  // Try to find existing pool
  const existingPool = await factory.getPool(
    CONFIG.tokenAAddress,
    CONFIG.tokenBAddress,
    CONFIG.feeTier
  );
  
  if (existingPool) {
    logResult('Found existing pool', formatAddress(existingPool.poolAddress));
    logResult('Pool ID', formatAddress(existingPool.poolId));
    logResult('Fee tier', `${FEE_TIER_LABELS[CONFIG.feeTier]}`);
    logResult('Pool status', existingPool.isActive ? 'Active' : 'Inactive');
  } else {
    logResult('Pool not found, creating new pool...', '');
    
    const { pool, receipt } = await factory.getOrCreatePool({
      token0: CONFIG.tokenAAddress,
      token1: CONFIG.tokenBAddress,
      feeTier: CONFIG.feeTier,
    });
    
    logResult('Created pool', formatAddress(pool.poolAddress));
    logResult('Creation TX', formatAddress(receipt!.txHash));
  }

  // --------------------------------------------------------------------------
  // Step 5: Get Swap Quote
  // --------------------------------------------------------------------------
  
  logStep(5, 'Get Swap Quote');
  
  // Build swap route
  const route: SwapRoute = {
    hops: [{
      tokenIn: CONFIG.tokenAAddress,
      tokenOut: CONFIG.tokenBAddress,
      feeTier: CONFIG.feeTier,
    }],
    tokenIn: CONFIG.tokenAAddress,
    tokenOut: CONFIG.tokenBAddress,
    totalFeeBps: 50, // 0.5%
  };
  
  // Get quote
  const quote = await router.quoteExactInput(route, CONFIG.swapAmount);
  
  logResult('Input amount', `${formatAmount(CONFIG.swapAmount, 6)} USDC`);
  logResult('Expected output', `${formatAmount(quote.expectedAmountOut, 18)} WETH`);
  logResult('Price impact', `${(quote.priceImpactBps / 100).toFixed(2)}%`);
  logResult('Total fees', `${(quote.totalFeeBps / 100).toFixed(2)}%`);
  logResult('Gas estimate', `${quote.estimatedGas} gas`);
  logResult('Quote valid until', new Date(Number(quote.deadline) * 1000).toISOString());
  
  // Calculate minimum output with slippage
  const minAmountOut = quote.expectedAmountOut * BigInt(10000 - CONFIG.slippageBps) / 10000n;
  logResult('Min output (with slippage)', `${formatAmount(minAmountOut, 18)} WETH`);

  // --------------------------------------------------------------------------
  // Step 6: Execute Swap
  // --------------------------------------------------------------------------
  
  logStep(6, 'Execute Swap');
  
  const swapParams = {
    route,
    amountIn: CONFIG.swapAmount,
    amountOutMinimum: minAmountOut,
    recipient: signerAddress,
    deadline: BigInt(Math.floor(Date.now() / 1000) + CONFIG.deadlineSeconds),
  };
  
  console.log('  Submitting swap transaction...');
  
  const swapResult = await router.swapExactInput(swapParams);
  
  logResult('Swap TX hash', formatAddress(swapResult.txReceipt.txHash));
  logResult('Status', swapResult.txReceipt.status);
  logResult('Block number', swapResult.txReceipt.blockNumber.toString());
  logResult('Gas used', swapResult.txReceipt.gasUsed.toString());

  // --------------------------------------------------------------------------
  // Step 7: Verify Results
  // --------------------------------------------------------------------------
  
  logStep(7, 'Verify Results');
  
  // Decrypt the output amount
  const outputDecrypted = decrypt(swapResult.amountOut, keyPair);
  logResult('Actual output', `${formatAmount(outputDecrypted.value, 18)} WETH`);
  
  // Verify output meets minimum
  if (outputDecrypted.value >= minAmountOut) {
    logResult('Slippage check', 'PASSED ✓');
  } else {
    logResult('Slippage check', 'FAILED ✗');
    throw new Error('Output amount below minimum');
  }
  
  // Check effective price
  const effectivePrice = outputDecrypted.value;
  logResult('Effective price', `1 USDC = ${formatAmount(effectivePrice * 1000000n / CONFIG.swapAmount, 18)} WETH`);

  // --------------------------------------------------------------------------
  // Step 8: Check Updated Balances
  // --------------------------------------------------------------------------
  
  logStep(8, 'Check Updated Balances');
  
  const newBalanceA = await tokenA.getMyBalance();
  const newBalanceB = await tokenB.getMyBalance();
  
  logResult('Token A balance', `${formatAmount(newBalanceA.plaintext, 6)} USDC`);
  logResult('Token B balance', `${formatAmount(newBalanceB.plaintext, 18)} WETH`);
  
  // Verify balances changed as expected
  const tokenASpent = balanceA.plaintext - newBalanceA.plaintext;
  const tokenBReceived = newBalanceB.plaintext - balanceB.plaintext;
  
  logResult('Token A spent', `${formatAmount(tokenASpent, 6)} USDC`);
  logResult('Token B received', `${formatAmount(tokenBReceived, 18)} WETH`);

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SWAP SUMMARY                          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Sold:     ${formatAmount(CONFIG.swapAmount, 6).padEnd(20)} USDC                    ║`);
  console.log(`║  Received: ${formatAmount(outputDecrypted.value, 18).padEnd(20)} WETH                   ║`);
  console.log(`║  Price:    1 USDC = ${formatAmount(outputDecrypted.value * 1000000n / CONFIG.swapAmount, 18)} WETH              ║`);
  console.log(`║  TX Hash:  ${formatAddress(swapResult.txReceipt.txHash).padEnd(20)}                    ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  console.log('\n✓ Swap completed successfully!');
}

// Fee tier labels
const FEE_TIER_LABELS: Record<number, string> = {
  1: '0.01%',
  2: '0.05%',
  3: '0.30%',
  4: '1.00%',
};

// ============================================================================
// Run the Example
// ============================================================================

executeSwapFlow()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Swap failed with error:');
    console.error(`  ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });

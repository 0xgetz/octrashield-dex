// TODO: Octra Network uses Operation Units (OU), NOT gas.
// Replace all `gas` / `estimateGas` / `gasLimit` references with OU equivalents:
//   - Query OU fee: octra_recommendedFee RPC method
//   - Field name: "ou" (not "gas" or "gasLimit")
// See: https://octrascan.io/docs.html#octra_recommendedFee

/**
 * Comprehensive Test Suite for Mock OctraShield Packages
 * 
 * This file demonstrates and tests all mock package functionality:
 * - Basic encryption/decryption with mock HFHE
 * - Creating and using mock clients (Factory, Pair, Router, ShieldToken, AIEngine)
 * - Simulated swap flow
 * - Liquidity management
 * - Noise budget tracking
 * 
 * Run with: npx tsx examples/test-mock-implementation.ts
 */

import {
  generateKeyPair,
  encrypt,
  decrypt,
  encryptNumber,
  decryptNumber,
  simulateAdd,
  simulateSub,
  simulateMul,
  hasNoiseBudget,
  reencrypt,
  isValidCiphertext,
  isValidPlaintext,
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldPow,
  fieldInverse,
  bytesToHex,
  hexToBytes,
  encryptBatch,
  decryptBatch,
  DEFAULT_NOISE_BUDGET,
  MERSENNE_PRIME,
  NoiseBudgetExhausted,
  InvalidPlaintext,
  InvalidCiphertext,
} from '../mock-octra-hfhe/src/index.js';

import {
  MockTransactionBuilder,
  MockFactoryClient,
  MockPairClient,
  MockRouterClient,
  MockShieldTokenClient,
  MockAIEngineClient,
  createMockTransactionBuilder,
  createMockKeyPair,
  createMockFactoryClient,
  createMockPairClient,
  createMockRouterClient,
  createMockShieldTokenClient,
  createMockAIEngineClient,
  mockAddress,
  mockPoolId,
  mockPositionId,
  mockHex,
  FEE_TIERS,
  MIN_TICK,
  MAX_TICK,
  OctraShieldError,
  EncryptionError,
  PoolNotFound,
  InsufficientLiquidity,
} from '../mock-octra-sdk/src/index.js';

// ============================================================================
// Test Runner Utilities
// ============================================================================

let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passedTests++;
    process.stdout.write('.');
  } else {
    failedTests++;
    failures.push(message);
    process.stdout.write('F');
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: expected ${expected}, got ${actual}`);
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assertThrows(fn: () => void, errorClass: new () => Error, message: string): void {
  try {
    fn();
    assert(false, `${message}: expected ${errorClass.name} to be thrown`);
  } catch (e) {
    assert(e instanceof errorClass, `${message}: expected ${errorClass.name}, got ${e instanceof Error ? e.constructor.name : 'unknown'}`);
  }
}

function runTests(name: string, tests: () => void): void {
  process.stdout.write(`\n${name}: `);
  tests();
}

function printSummary(): void {
  process.stdout.write(`\n\n========================================\n`);
  process.stdout.write(`Test Results: ${passedTests} passed, ${failedTests} failed\n`);
  if (failures.length > 0) {
    process.stdout.write(`\nFailures:\n`);
    failures.forEach((f, i) => process.stdout.write(`  ${i + 1}. ${f}\n`));
  }
  process.stdout.write(`========================================\n`);
  process.exit(failedTests > 0 ? 1 : 0);
}

// ============================================================================
// HFHE Mock Tests
// ============================================================================

runTests('HFHE Key Generation', () => {
  const keyPair = generateKeyPair();
  assert(keyPair.publicKey instanceof Uint8Array, 'publicKey is Uint8Array');
  assert(keyPair.secretKey instanceof Uint8Array, 'secretKey is Uint8Array');
  assertEqual(keyPair.publicKey.length, 32, 'publicKey length');
  assertEqual(keyPair.secretKey.length, 32, 'secretKey length');
  assert(typeof keyPair.fingerprint === 'string', 'fingerprint is string');
  assertEqual(keyPair.fingerprint.length, 16, 'fingerprint length');
});

runTests('HFHE Encryption/Decryption', () => {
  const keyPair = generateKeyPair();
  
  // Test basic encryption
  const plaintext = 12345n;
  const encrypted = encrypt(plaintext, keyPair);
  assert(typeof encrypted.ciphertext === 'string', 'ciphertext is string');
  assertEqual(encrypted.noiseBudget, DEFAULT_NOISE_BUDGET, 'initial noise budget');
  assertEqual(encrypted.isZeroProof, false, 'isZeroProof');
  
  // Test decryption
  const decrypted = decrypt(encrypted, keyPair);
  assertEqual(decrypted.value, plaintext, 'decrypted value matches plaintext');
  assert(decrypted.decryptionProof instanceof Uint8Array, 'decryptionProof is Uint8Array');
  assertEqual(decrypted.originalCiphertext, encrypted.ciphertext, 'originalCiphertext preserved');
  
  // Test encryptNumber/decryptNumber
  const numEncrypted = encryptNumber(42, keyPair);
  const numDecrypted = decryptNumber(numEncrypted, keyPair);
  assertEqual(numDecrypted, 42, 'number round-trip');
  
  // Test encryptZero
  const zeroEncrypted = encrypt(0n, keyPair);
  const zeroDecrypted = decrypt(zeroEncrypted, keyPair);
  assertEqual(zeroDecrypted.value, 0n, 'zero encryption');
});

runTests('HFHE Validation', () => {
  assertThrows(
    () => encrypt(-1n, generateKeyPair()),
    InvalidPlaintext,
    'negative plaintext rejected'
  );
  
  assertThrows(
    () => encrypt(MERSENNE_PRIME, generateKeyPair()),
    InvalidPlaintext,
    'plaintext >= MERSENNE_PRIME rejected'
  );
  
  assert(isValidPlaintext(0n), '0 is valid plaintext');
  assert(isValidPlaintext(100n), '100 is valid plaintext');
  assert(isValidPlaintext(MERSENNE_PRIME - 1n), 'MERSENNE_PRIME-1 is valid');
  
  assert(isValidCiphertext('abc123'), 'valid hex ciphertext');
  assert(isValidCiphertext('0xabc123'), 'valid hex with 0x prefix');
  assert(!isValidCiphertext(''), 'empty string invalid');
  assert(!isValidCiphertext('xyz'), 'non-hex invalid');
  
  assertThrows(
    () => decrypt({ ciphertext: '', noiseBudget: 120, isZeroProof: false }, generateKeyPair()),
    InvalidCiphertext,
    'empty ciphertext rejected'
  );
});

runTests('HFHE Homomorphic Operations', () => {
  const keyPair = generateKeyPair();
  
  // Test addition
  const a = encrypt(100n, keyPair);
  const b = encrypt(50n, keyPair);
  const sum = simulateAdd(a, b);
  assertEqual(sum.noiseBudget, DEFAULT_NOISE_BUDGET - 1, 'addition noise cost');
  
  // Decrypt and verify
  const sumDecrypted = decrypt(sum, keyPair);
  assertEqual(sumDecrypted.value, 150n, 'addition result');
  
  // Test subtraction
  const c = encrypt(100n, keyPair);
  const d = encrypt(30n, keyPair);
  const diff = simulateSub(c, d);
  assertEqual(diff.noiseBudget, DEFAULT_NOISE_BUDGET - 1, 'subtraction noise cost');
  
  const diffDecrypted = decrypt(diff, keyPair);
  assertEqual(diffDecrypted.value, 70n, 'subtraction result');
  
  // Test multiplication
  const e = encrypt(10n, keyPair);
  const f = encrypt(5n, keyPair);
  const product = simulateMul(e, f);
  assertEqual(product.noiseBudget, DEFAULT_NOISE_BUDGET - 3, 'multiplication noise cost');
  
  const productDecrypted = decrypt(product, keyPair);
  assertEqual(productDecrypted.value, 50n, 'multiplication result');
});

runTests('HFHE Noise Budget Tracking', () => {
  const keyPair = generateKeyPair();
  
  // Test hasNoiseBudget
  const ct = encrypt(100n, keyPair);
  assert(hasNoiseBudget(ct, 'ADD'), 'has budget for ADD');
  assert(hasNoiseBudget(ct, 'SUB'), 'has budget for SUB');
  assert(hasNoiseBudget(ct, 'MUL'), 'has budget for MUL');
  
  // Exhaust noise budget through repeated operations
  let current = ct;
  for (let i = 0; i < DEFAULT_NOISE_BUDGET - 1; i++) {
    current = simulateAdd(current, encrypt(1n, keyPair));
  }
  
  assertEqual(current.noiseBudget, 1, 'noise budget after exhaustion');
  assert(!hasNoiseBudget(current, 'ADD'), 'no budget left for ADD');
  
  assertThrows(
    () => simulateAdd(current, encrypt(1n, keyPair)),
    NoiseBudgetExhausted,
    'operation fails when noise exhausted'
  );
  
  // Test re-encryption
  const refreshed = reencrypt(current, keyPair);
  assertEqual(refreshed.noiseBudget, DEFAULT_NOISE_BUDGET, 'noise budget refreshed');
  assert(hasNoiseBudget(refreshed, 'ADD'), 'can operate after refresh');
});

runTests('HFHE Batch Operations', () => {
  const keyPair = generateKeyPair();
  const plaintexts = [10n, 20n, 30n, 40n, 50n];
  
  const encrypted = encryptBatch(plaintexts, keyPair);
  assertEqual(encrypted.length, 5, 'batch encrypt count');
  
  const decrypted = decryptBatch(encrypted, keyPair);
  assertEqual(decrypted.length, 5, 'batch decrypt count');
  
  for (let i = 0; i < plaintexts.length; i++) {
    assertEqual(decrypted[i].value, plaintexts[i], `batch item ${i}`);
  }
});

runTests('HFHE Field Arithmetic', () => {
  assertEqual(fieldAdd(5n, 3n), 5n ^ 3n, 'fieldAdd (XOR)');
  assertEqual(fieldSub(5n, 3n), 5n ^ 3n, 'fieldSub (XOR)');
  assertEqual(fieldMul(5n, 3n), 5n & 3n, 'fieldMul (AND)');
  assertEqual(fieldPow(2n, 10n), 1024n, 'fieldPow');
  assertEqual(fieldInverse(42n), 42n, 'fieldInverse (identity in mock)');
});

runTests('HFHE Utility Functions', () => {
  const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x0f]);
  const hex = bytesToHex(bytes);
  assertEqual(hex, '10203ff', 'bytesToHex');
  
  const roundTripped = hexToBytes(hex);
  assertDeepEqual(roundTripped, bytes, 'hexToBytes round-trip');
  
  const hexWithPrefix = hexToBytes('0x10203ff');
  assertDeepEqual(roundTripped, hexWithPrefix, 'hexToBytes with 0x prefix');
});

// ============================================================================
// SDK Mock Tests
// ============================================================================

runTests('SDK TransactionBuilder', async () => {
  const tx = createMockTransactionBuilder({ network: 'testnet' });
  await tx.initialize();
  
  const signer = tx.getSignerAddress();
  assert(typeof signer === 'string', 'getSignerAddress returns string');
  assertEqual(signer.length, 64, 'signer address length');
  
  // Test view call
  const viewResult = await tx.viewCall(mockAddress('contract'), 'getBalance', []);
  assert(viewResult !== null, 'viewCall returns result');
  
  // Test call transaction
  const receipt = await tx.callTransaction(mockAddress('contract'), 'transfer', []);
  assert(typeof receipt.txHash === 'string', 'receipt has txHash');
  assertEqual(receipt.status, 'success', 'receipt status');
  assert(receipt.events.length > 0, 'receipt has events');
  
  // Test gas estimation
  const gas = await tx.estimateGas(mockAddress('contract'), 'swap', []);
  assertEqual(gas, BigInt(100000), 'gas estimation');
});

runTests('SDK FactoryClient', async () => {
  const tx = createMockTransactionBuilder();
  await tx.initialize();
  const factory = createMockFactoryClient(tx);
  
  const tokenA = mockAddress('tokenA');
  const tokenB = mockAddress('tokenB');
  
  // Test getPool
  const pool = await factory.getPool(tokenA, tokenB, 2);
  assert(pool !== null, 'getPool returns pool');
  assert(typeof pool.poolId === 'string', 'pool has poolId');
  assertEqual(pool.isActive, true, 'pool is active');
  assertEqual(pool.feeTier, 2, 'pool fee tier');
  
  // Test getAllPools
  const allPools = await factory.getAllPools();
  assert(allPools.items.length >= 1, 'getAllPools returns items');
  assertEqual(allPools.total, 1, 'total count');
  assertEqual(allPools.hasMore, false, 'hasMore');
  
  // Test getFeeTiers
  const feeTiers = await factory.getFeeTiers();
  assertEqual(Object.keys(feeTiers).length, 4, 'fee tiers count');
  assertEqual(feeTiers[2].tickSpacing, 60, 'fee tier 2 tick spacing');
  
  // Test poolExists
  const exists = await factory.poolExists(tokenA, tokenB, 2);
  assertEqual(exists, true, 'pool exists');
  
  // Test createPool
  const createReceipt = await factory.createPool({
    token0: tokenA,
    token1: tokenB,
    feeTier: 3,
  });
  assertEqual(createReceipt.status, 'success', 'createPool receipt');
});

runTests('SDK PairClient', async () => {
  const tx = createMockTransactionBuilder();
  await tx.initialize();
  const keyPair = createMockKeyPair();
  const pair = createMockPairClient(tx, keyPair);
  
  // Test getPoolState
  const state = await pair.getPoolState();
  assert(typeof state.poolId === 'string', 'pool state has poolId');
  assertEqual(state.isActive, true, 'pool is active');
  assertEqual(state.currentTick, 0, 'current tick');
  
  // Test getReserves
  const reserves = await pair.getReserves();
  assert(reserves.reserve0.noiseBudget > 0, 'reserve0 encrypted');
  assert(reserves.reserve1.noiseBudget > 0, 'reserve1 encrypted');
  
  // Test decryptReserves
  const decryptedReserves = pair.decryptReserves(reserves);
  assertEqual(decryptedReserves.reserve0, 1000000n, 'decrypted reserve0');
  assertEqual(decryptedReserves.reserve1, 1000000n, 'decrypted reserve1');
  
  // Test getMyPositions
  const positions = await pair.getMyPositions();
  assert(positions.items.length >= 1, 'has positions');
  assertEqual(positions.total, 1, 'total positions');
  
  // Test addLiquidity
  const liqReceipt = await pair.addLiquidity({
    poolId: mockPoolId('token0', 'token1', 2),
    tickLower: MIN_TICK,
    tickUpper: MAX_TICK,
    amount0Desired: 1000000n,
    amount1Desired: 1000000n,
    amount0Min: 900000n,
    amount1Min: 900000n,
    recipient: tx.getSignerAddress(),
    deadline: BigInt(Date.now() / 1000 + 1200),
  });
  assert(typeof liqReceipt.positionId === 'string', 'addLiquidity returns positionId');
  assertEqual(liqReceipt.txReceipt.status, 'success', 'addLiquidity receipt');
});

runTests('SDK RouterClient', async () => {
  const tx = createMockTransactionBuilder();
  await tx.initialize();
  const keyPair = createMockKeyPair();
  const router = createMockRouterClient(tx, keyPair);
  
  const tokenIn = mockAddress('tokenIn');
  const tokenOut = mockAddress('tokenOut');
  const amountIn = 1000000n;
  
  // Build a simple route
  const route = {
    hops: [{
      tokenIn,
      tokenOut,
      feeTier: 2,
    }],
    tokenIn,
    tokenOut,
    totalFeeBps: 50,
  };
  
  // Test quoteExactInput
  const quote = await router.quoteExactInput(route, amountIn);
  assert(quote.expectedAmountOut > 0n, 'quote has expectedAmountOut');
  assert(quote.priceImpactBps >= 0, 'quote has priceImpactBps');
  assertEqual(quote.totalFeeBps, 50, 'quote totalFeeBps');
  
  // Test swapExactInput
  const swapResult = await router.swapExactInput({
    route,
    amountIn,
    amountOutMinimum: quote.expectedAmountOut * 99n / 100n, // 1% slippage
    recipient: tx.getSignerAddress(),
    deadline: BigInt(Date.now() / 1000 + 1200),
  });
  assert(typeof swapResult.amountIn.ciphertext === 'string', 'swapResult amountIn encrypted');
  assert(typeof swapResult.amountOut.ciphertext === 'string', 'swapResult amountOut encrypted');
  assertEqual(swapResult.txReceipt.status, 'success', 'swap receipt');
  
  // Test buildDarkPoolParams
  const darkParams = router.buildDarkPoolParams(
    0n, true, amountIn, 900000n, 12345n, BigInt(Date.now() / 1000 + 1200)
  );
  assert(darkParams.encryptedPoolSelector.noiseBudget > 0, 'dark pool params encrypted');
});

runTests('SDK ShieldTokenClient', async () => {
  const tx = createMockTransactionBuilder();
  await tx.initialize();
  const keyPair = createMockKeyPair();
  const token = createMockShieldTokenClient(tx, keyPair);
  
  // Test getTokenInfo
  const info = await token.getTokenInfo();
  assertEqual(info.name, 'MockToken', 'token name');
  assertEqual(info.symbol, 'MTK', 'token symbol');
  assertEqual(info.decimals, 18, 'token decimals');
  
  // Test getBalance
  const balance = await token.getBalance(tx.getSignerAddress());
  assert(balance.encryptedBalance.noiseBudget > 0, 'balance encrypted');
  
  // Test decryptBalance
  const decryptedBalance = token.decryptBalance(balance);
  assertEqual(decryptedBalance, 1000000000000000000n, 'decrypted balance (1 token)');
  
  // Test approve
  const approveReceipt = await token.approve(mockAddress('spender'), 1000000n);
  assertEqual(approveReceipt.status, 'success', 'approve receipt');
  
  // Test ensureAllowance
  const allowanceResult = await token.ensureAllowance(mockAddress('spender'), 500000n);
  assertEqual(allowanceResult.approved, false, 'ensureAllowance (already sufficient)');
  
  // Test getMyBalance
  const myBalance = await token.getMyBalance();
  assert(myBalance.plaintext > 0n, 'my balance plaintext');
});

runTests('SDK AIEngineClient', async () => {
  const tx = createMockTransactionBuilder();
  await tx.initialize();
  const keyPair = createMockKeyPair();
  const ai = createMockAIEngineClient(tx, keyPair);
  
  const poolId = mockPoolId('tokenA', 'tokenB', 2);
  
  // Test getDynamicFee
  const fee = await ai.getDynamicFee(poolId);
  assert(typeof fee.poolId === 'string', 'dynamic fee poolId');
  assert(fee.multiplierBps > 0, 'fee multiplier');
  assert(fee.confidence > 0 && fee.confidence <= 1, 'fee confidence');
  
  // Test decryptFee
  const decryptedFee = ai.decryptFee(fee);
  assertEqual(decryptedFee.baseFee, 3000n, 'decrypted base fee');
  assertEqual(decryptedFee.adjustedFee, 3500n, 'decrypted adjusted fee');
  
  // Test getVolatility
  const vol = await ai.getVolatility(poolId);
  assert(vol.emaVolatility.noiseBudget > 0, 'volatility encrypted');
  
  // Test getMevAlerts
  const alerts = await ai.getMevAlerts(poolId);
  assert(Array.isArray(alerts), 'mevAlerts is array');
  
  // Test isPoolSafe
  const safe = await ai.isPoolSafe(poolId);
  assertEqual(safe.safe, true, 'pool is safe');
  assertEqual(safe.riskLevel, 'low', 'risk level');
  
  // Test getHealthStatus
  const health = await ai.getHealthStatus();
  assertEqual(health.isOnline, true, 'AI engine online');
  assert(health.poolsMonitored > 0, 'pools monitored');
});

// ============================================================================
// Integration Test: Complete Swap Flow
// ============================================================================

runTests('Integration: Complete Swap Flow', async () => {
  // Setup
  const tx = createMockTransactionBuilder({ network: 'testnet' });
  await tx.initialize();
  const keyPair = createMockKeyPair();
  
  const factory = createMockFactoryClient(tx);
  const router = createMockRouterClient(tx, keyPair);
  const tokenA = createMockShieldTokenClient(tx, keyPair, mockAddress('tokenA'));
  const tokenB = createMockShieldTokenClient(tx, keyPair, mockAddress('tokenB'));
  
  // 1. Check balances
  const balanceA = await tokenA.getMyBalance();
  assert(balanceA.plaintext > 0n, 'has tokenA balance');
  
  // 2. Ensure allowance for router
  const routerAddress = mockAddress('router');
  const allowanceResult = await tokenA.ensureAllowance(routerAddress, 1000000n);
  assert(allowanceResult.approved === false || allowanceResult.receipt !== undefined, 'allowance check');
  
  // 3. Get pool info
  const pool = await factory.getPool(
    mockAddress('tokenA'),
    mockAddress('tokenB'),
    2
  );
  assert(pool !== null, 'found pool');
  assertEqual(pool.isActive, true, 'pool active');
  
  // 4. Get swap quote
  const route = {
    hops: [{
      tokenIn: mockAddress('tokenA'),
      tokenOut: mockAddress('tokenB'),
      feeTier: 2,
    }],
    tokenIn: mockAddress('tokenA'),
    tokenOut: mockAddress('tokenB'),
    totalFeeBps: 50,
  };
  
  const quote = await router.quoteExactInput(route, 1000000n);
  assert(quote.expectedAmountOut > 0n, 'got quote');
  
  // 5. Execute swap
  const swapResult = await router.swapExactInput({
    route,
    amountIn: 1000000n,
    amountOutMinimum: quote.expectedAmountOut * 99n / 100n,
    recipient: tx.getSignerAddress(),
    deadline: BigInt(Date.now() / 1000 + 1200),
  });
  
  assertEqual(swapResult.txReceipt.status, 'success', 'swap executed');
  assert(typeof swapResult.amountOut.ciphertext === 'string', 'output encrypted');
});

// ============================================================================
// Integration Test: Liquidity Management
// ============================================================================

runTests('Integration: Liquidity Management', async () => {
  const tx = createMockTransactionBuilder({ network: 'testnet' });
  await tx.initialize();
  const keyPair = createMockKeyPair();
  
  // Create factory and get pool
  const factory = createMockFactoryClient(tx);
  const pool = await factory.getPool(
    mockAddress('token0'),
    mockAddress('token1'),
    2
  );
  assert(pool !== null, 'found pool for liquidity');
  
  // Create pair client
  const pair = createMockPairClient(tx, keyPair, pool.poolAddress);
  
  // 1. Add full-range liquidity
  const liqResult = await pair.addFullRangeLiquidity(
    1000000n,
    1000000n,
    60, // tickSpacing
    tx.getSignerAddress(),
    BigInt(Date.now() / 1000 + 1200)
  );
  
  assert(typeof liqResult.positionId === 'string', 'created position');
  assertEqual(liqResult.txReceipt.status, 'success', 'add liquidity receipt');
  
  // 2. Get position
  const position = await pair.getPosition(liqResult.positionId);
  assert(position !== null, 'got position');
  assertEqual(position.owner, tx.getSignerAddress(), 'position owner');
  
  // 3. Get position summary
  const summary = await pair.getPositionSummary();
  assert(summary.length > 0, 'has position summary');
  assertEqual(summary[0].inRange, true, 'position in range');
  
  // 4. Collect fees
  const collectReceipt = await pair.collectFees(liqResult.positionId);
  assertEqual(collectReceipt.status, 'success', 'collect fees receipt');
  
  // 5. Remove liquidity
  const removeResult = await pair.removeLiquidity({
    positionId: liqResult.positionId,
    liquidityAmount: 500000n,
    amount0Min: 400000n,
    amount1Min: 400000n,
    recipient: tx.getSignerAddress(),
    deadline: BigInt(Date.now() / 1000 + 1200),
  });
  
  assertEqual(removeResult.txReceipt.status, 'success', 'remove liquidity receipt');
});

// ============================================================================
// Print Summary
// ============================================================================

printSummary();

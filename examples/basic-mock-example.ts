/**
 * Basic Mock Example — Demonstrates core mock package functionality
 * Run with: npx tsx examples/basic-mock-example.ts
 */

import {
  generateKeyPair, encrypt, decrypt, simulateAdd, DEFAULT_NOISE_BUDGET,
} from 'mock-octra-hfhe';
import {
  MockTransactionBuilder, MockFactoryClient, MockRouterClient,
  createMockKeyPair, mockAddress, FEE_TIERS,
} from 'mock-octra-sdk';

async function main() {
  // 1. Basic Encryption/Decryption with HFHE
  console.log('=== HFHE Encryption Demo ===');
  const keyPair = generateKeyPair();
  console.log('Keypair fingerprint:', keyPair.fingerprint);

  const plaintext = 42n;
  const encrypted = encrypt(plaintext, keyPair);
  console.log(`Encrypted ${plaintext} (noiseBudget=${encrypted.noiseBudget})`);

  const decrypted = decrypt(encrypted, keyPair);
  console.log(`Decrypted: ${decrypted.value}`);

  // Homomorphic addition
  const a = encrypt(100n, keyPair);
  const b = encrypt(50n, keyPair);
  const sum = simulateAdd(a, b);
  const sumResult = decrypt(sum, keyPair);
  console.log(`Homomorphic: 100 + 50 = ${sumResult.value} (noise: ${sum.noiseBudget})`);

  // 2. TransactionBuilder
  console.log('\n=== TransactionBuilder Demo ===');
  const txBuilder = new MockTransactionBuilder({ network: 'testnet' });
  await txBuilder.initialize();
  console.log('Signer:', txBuilder.getSignerAddress());

  const balance = await txBuilder.viewCall<unknown>(mockAddress('token'), 'balanceOf', []);
  console.log('Balance view:', balance);

  const receipt = await txBuilder.callTransaction(mockAddress('contract'), 'transfer', [], 1200);
  console.log('Tx receipt:', receipt.txHash.slice(0, 16) + '...', receipt.status);

  // 3. FactoryClient — Pool Registry
  console.log('\n=== FactoryClient Demo ===');
  const factory = new MockFactoryClient(txBuilder, mockAddress('factory'));
  const pool = await factory.getPool(mockAddress('tokenA'), mockAddress('tokenB'), 2);
  console.log('Pool:', pool?.poolId?.slice(0, 16) + '...');
  console.log('Fee tier:', FEE_TIERS[2]);

  // 4. RouterClient — Swaps
  console.log('\n=== RouterClient Demo ===');
  const keyPairForSdk = createMockKeyPair();
  const router = new MockRouterClient(txBuilder, keyPairForSdk, mockAddress('router'));

  const tokenIn = mockAddress('tokenA');
  const tokenOut = mockAddress('tokenB');
  const route = { hops: [{ tokenIn, tokenOut, feeTier: 2 }], tokenIn, tokenOut, totalFeeBps: 30 };

  const amountIn = 1000n;
  const quote = await router.quoteExactInput(route, amountIn);
  console.log(`Quote: ${amountIn} -> ${quote.expectedAmountOut} (impact: ${quote.priceImpactBps}bps)`);

  const swapResult = await router.swapExactInput({
    route, amountIn,
    amountOutMinimum: quote.expectedAmountOut * 99n / 100n,
    recipient: txBuilder.getSignerAddress(), deadline: quote.deadline,
  });
  console.log('Swap executed:', swapResult.txReceipt.status);

  console.log('\n=== All demos completed! ===');
}

main().catch(console.error);

/**
 * @octrashield/dex-sdk
 *
 * Complete TypeScript SDK for OctraShield DEX.
 *
 * Features:
 *   - Client-side HFHE encryption/decryption (Mersenne prime field)
 *   - OCS01 transaction builder with Ed25519 signing
 *   - Contract clients for all 5 DEX contracts
 *   - React hooks for DeFi UI integration
 *   - Multi-hop swap routing algorithm
 *   - Price/tick math, slippage calculations, APR estimation
 *
 * Quick Start:
 * ```tsx
 * import { useOctraShield, useSwap, usePool } from '@octrashield/dex-sdk/hooks';
 * import { generateKeyPair, encrypt, decrypt } from '@octrashield/dex-sdk/core';
 *
 * function App() {
 *   const { connect, isConnected, clients } = useOctraShield({ network: 'octra-testnet' });
 *   const { quote, execute } = useSwap(txBuilder, keyPair, routerAddress);
 *   // ...
 * }
 * ```
 *
 * For programmatic (non-React) usage:
 * ```ts
 * import { TransactionBuilder, generateKeyPair, encrypt } from '@octrashield/dex-sdk/core';
 * import { RouterClient, FactoryClient } from '@octrashield/dex-sdk/clients';
 *
 * const keyPair = generateKeyPair();
 * const txBuilder = new TransactionBuilder(config, signingKey);
 * await txBuilder.initialize();
 *
 * const router = new RouterClient(txBuilder, keyPair, routerAddress);
 * const result = await router.simpleSwap(tokenIn, tokenOut, amount);
 * ```
 */

// Re-export everything from sub-modules
export * from './core/index.js';
export * from './clients/index.js';
export * from './utils/index.js';

// Hooks are exported separately to avoid React dependency for non-React users
// Import from '@octrashield/dex-sdk/hooks' for React hooks

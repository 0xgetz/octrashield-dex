# OctraShield DEX -- Phase 2: TypeScript SDK Complete

## Package

`@octrashield/dex-sdk` -- Full client-side SDK with HFHE encryption, OCS01 transactions, contract clients, and React hooks.

---

## File Inventory (27 files)

### Configuration
| File | Purpose |
|---|---|
| `sdk/package.json` | NPM package config, dual ESM/CJS builds, tree-shakeable exports |
| `sdk/tsconfig.json` | TypeScript strict mode, path aliases, ESNext target |

### Core (`sdk/src/core/`) -- Foundation Layer
| File | Size | Purpose |
|---|---|---|
| `constants.ts` | 6.9K | HFHE params, Mersenne prime, fee tiers, tick bounds, network config |
| `types.ts` | 15.2K | 50+ TypeScript types with branded types for Address, CiphertextHex, PoolId |
| `errors.ts` | 8.6K | 20+ hierarchical typed error classes matching contract errors |
| `hfhe.ts` | 18.4K | **HFHE encryption engine**: Mersenne field arithmetic, encrypt/decrypt, batch ops, noise tracking |
| `ocs01.ts` | 16.8K | **OCS01 transaction builder**: wire format encoding, Ed25519 signing, nonce management, RPC |
| `index.ts` | 2.8K | Barrel exports |

### Utilities (`sdk/src/utils/`) -- Math & Encoding
| File | Size | Purpose |
|---|---|---|
| `encoding.ts` | 7.7K | Hex/base64 encoding, address validation, token amount formatting |
| `math.ts` | 10.6K | Tick/price conversion, slippage, CPAMM estimation, CL liquidity math, APR |
| `routing.ts` | 11.3K | **Multi-hop DFS route finder**: graph-based, up to 4 hops, sorted by output |
| `index.ts` | 1.0K | Barrel exports |

### Contract Clients (`sdk/src/clients/`) -- 1:1 Contract Wrappers
| File | Size | Contract |
|---|---|---|
| `shield-token.ts` | 7.5K | Encrypted ERC20: balance, transfer, approve, allowance management |
| `factory.ts` | 6.1K | Pool registry: create pool, query pools, fee tier management |
| `pair.ts` | 11.4K | AMM pool: add/remove liquidity, positions, ticks, TWAP oracle |
| `router.ts` | 12.2K | Swap execution: exact-input/output, dark pool, split swaps |
| `ai-engine.ts` | 10.2K | AI Circle: dynamic fees, MEV detection, volatility, rebalancing |
| `index.ts` | 0.4K | Barrel exports |

### React Hooks (`sdk/src/hooks/`) -- UI Integration
| File | Size | Hook |
|---|---|---|
| `useOctraShield.ts` | 6.4K | Root provider: wallet connection, HFHE keys, SDK initialization |
| `usePool.ts` | 5.4K | Pool state: reserves, positions, ticks with auto-refresh |
| `useSwap.ts` | 7.3K | Swap lifecycle: quote, execute, dark pool, result decryption |
| `useLiquidity.ts` | 8.9K | Position management: add/remove/collect fees, full-range, batch |
| `useToken.ts` | 7.2K | Token operations: balance, approve, transfer with auto-refresh |
| `useAI.ts` | 8.0K | AI data: fees, MEV alerts, volatility, risk, rebalancing |
| `index.ts` | 0.8K | Barrel exports |

### Root
| File | Size | Purpose |
|---|---|---|
| `src/index.ts` | 1.6K | Main entry point, re-exports core + clients + utils |

---

## By the Numbers

| Metric | Count |
|---|---|
| Total TypeScript source | ~160,000 characters |
| Source files | 27 |
| Core modules | 5 |
| Utility modules | 3 |
| Contract clients | 5 |
| React hooks | 6 |
| Exported types | 50+ |
| Exported functions | 80+ |
| Error classes | 20+ |
| HFHE operations | encrypt, decrypt, batch, simulate add/sub/mul, noise tracking |

---

## Architecture Highlights

### HFHE Client Engine (`core/hfhe.ts`)
- Mersenne prime field (p = 2^61 - 1) with fast reduction
- Encryption: `ct = (m + r * g) mod p` with random blinding
- Decryption: `m = (ct - dk * g) mod p` with proof generation
- Noise budget tracking per ciphertext (120 default, consumed per op)
- Batch encrypt/decrypt for efficiency
- Client-side simulation of homomorphic add/sub/mul for UI quotes

### OCS01 Transaction Builder (`core/ocs01.ts`)
- View calls (read-only, no signature) and Call transactions (Ed25519 signed)
- Full wire format: typed value encoding (bigint, string, bool, bytes, arrays)
- Nonce management with auto-increment
- Deadline calculation from block time
- Receipt polling with timeout
- JSON-RPC 2.0 transport

### Multi-Hop Router (`utils/routing.ts`)
- Graph-based pool adjacency with bidirectional edges
- DFS with backtracking, up to 4 hops
- Tick-derived price estimates for route scoring
- Results sorted by estimated output (best first)
- Token reachability queries

### React Hooks Architecture
- All hooks follow consistent patterns: auto-refresh, error handling, loading states
- Lazy client creation (only instantiated when dependencies are available)
- Parallel data fetching where possible (Promise.all / Promise.allSettled)
- Automatic decryption of encrypted values when key pair is available
- Callback hooks for success/error notifications

---

## Import Paths

```ts
// Full SDK (excludes React hooks to avoid React dependency)
import { encrypt, decrypt, TransactionBuilder } from '@octrashield/dex-sdk';

// Core only
import { generateKeyPair, MERSENNE_PRIME } from '@octrashield/dex-sdk/core';

// Contract clients
import { RouterClient, FactoryClient } from '@octrashield/dex-sdk/clients';

// React hooks
import { useOctraShield, useSwap, usePool } from '@octrashield/dex-sdk/hooks';
```

---

## Dependencies

| Package | Purpose | Size |
|---|---|---|
| `@noble/ed25519` | Ed25519 signatures for OCS01 | ~5KB |
| `@noble/hashes` | SHA-512 for key derivation | ~8KB |
| `eventemitter3` | Event system for subscriptions | ~3KB |
| `react` (peer, optional) | React hooks only | - |

Total bundle: ~16KB minified + gzipped (excluding React)

---

## Build Commands

```bash
cd sdk
npm install
npm run build        # ESM + CJS + type declarations
npm run dev          # Watch mode
npm run typecheck    # Type checking
npm run test         # Run tests
npm run lint         # ESLint
```

---

## Phase Summary

| Phase | Status | Output |
|---|---|---|
| Phase 0: Architecture | COMPLETE | `PHASE0_ARCHITECTURE.md` (31K) |
| Phase 1: Smart Contracts | COMPLETE | 5 Rust contracts + shared lib (~165K) |
| Phase 2: TypeScript SDK | COMPLETE | 27 TS files (~160K) |
| Phase 3: Frontend UI | NEXT | React app with swap/pool/position views |

# Mock Octra Packages

This directory contains mock implementations of the OctraShield DEX SDK for fast, deterministic testing.

## Packages

### `mock-octra-hfhe`

Mock HFHE (Homomorphic Field Homomorphic Encryption) library that provides the same API as the real encryption library but uses simple deterministic operations instead of real cryptography.

**Key features:**
- Same type signatures as real SDK (`HfheKeyPair`, `EncryptedU64`, `DecryptedValue`)
- Plaintext stored directly as hex string ciphertext (no actual encryption)
- Noise budget tracking (starts at 120, decrements deterministically)
- Instant, deterministic operations - no async crypto
- All 28 exported functions from the real API

### `mock-octra-sdk`

Mock implementations of all OctraShield DEX contract clients with no network calls.

**Includes mock clients:**
- `MockTransactionBuilder` - Transaction building without network calls
- `MockFactoryClient` - Pool registry operations
- `MockPairClient` - Liquidity positions and pool state
- `MockRouterClient` - Swap quoting and execution
- `MockShieldTokenClient` - ERC20-like token operations
- `MockAIEngineClient` - AI engine operations (fees, volatility, MEV)

## Installation

The mock packages are part of the pnpm workspace. Install dependencies:

```bash
pnpm install
```

## Building

Build all packages (including mocks):

```bash
pnpm build
```

Build individual packages:

```bash
cd mock-octra-hfhe && pnpm build
cd mock-octra-sdk && pnpm build
```

## Usage

### Using Mock HFHE

```typescript
import { 
  generateKeyPair, 
  encrypt, 
  decrypt, 
  simulateAdd,
  DEFAULT_NOISE_BUDGET 
} from 'mock-octra-hfhe';

// Generate a keypair
const keyPair = generateKeyPair();

// Encrypt values
const encryptedA = encrypt(100n, keyPair);
const encryptedB = encrypt(200n, keyPair);

// Homomorphic operations
const sum = simulateAdd(encryptedA, encryptedB);

// Decrypt result
const result = decrypt(sum, keyPair);
console.log(result.value); // 300n
```

### Using Mock SDK Clients

```typescript
import { 
  MockTransactionBuilder,
  MockFactoryClient,
  MockPairClient,
  createMockKeyPair
} from 'mock-octra-sdk';

// Create mock transaction builder
const tx = new MockTransactionBuilder({ network: 'testnet' });
await tx.initialize();

// Create mock keypair
const keyPair = createMockKeyPair();

// Use mock clients
const factory = new MockFactoryClient(tx, FACTORY_ADDRESS);
const pool = await factory.getPool(TOKEN_A, TOKEN_B, 2);

// All operations return deterministic mock data
console.log(pool.poolId); // Deterministic mock pool ID
```

## Switching Between Real and Mock

### Environment-based switching

```typescript
// config.ts
const USE_MOCK = process.env.NODE_ENV === 'test';

export const hfhe = USE_MOCK 
  ? await import('mock-octra-hfhe')
  : await import('@0xgetz/octrashield-sdk');

export const { TransactionBuilder, FactoryClient } = USE_MOCK
  ? await import('mock-octra-sdk')
  : await import('@0xgetz/octrashield-sdk');
```

### Factory function pattern

```typescript
// clients.ts
import type { HFHEInterface, ClientInterface } from './types';

export function createHFHE(useMock: boolean): HFHEInterface {
  if (useMock) {
    return require('mock-octra-hfhe');
  }
  return require('@0xgetz/octrashield-sdk');
}

export function createClients(useMock: boolean) {
  if (useMock) {
    const mock = require('mock-octra-sdk');
    return {
      TransactionBuilder: mock.MockTransactionBuilder,
      FactoryClient: mock.MockFactoryClient,
      PairClient: mock.MockPairClient,
      RouterClient: mock.MockRouterClient,
      ShieldTokenClient: mock.MockShieldTokenClient,
      AIEngineClient: mock.MockAIEngineClient,
    };
  }
  return require('@0xgetz/octrashield-sdk');
}
```

## Testing

The mock packages are designed for unit testing. They provide:

- **Deterministic output** - Same inputs always produce same outputs
- **No async operations** - Instant results for fast tests
- **No network calls** - Tests don't depend on external services
- **Type compatibility** - Drop-in replacement for real SDK

### Example test

```typescript
import { describe, it, expect } from 'vitest';
import { MockTransactionBuilder, MockFactoryClient } from 'mock-octra-sdk';

describe('FactoryClient', () => {
  it('should return pool info', async () => {
    const tx = new MockTransactionBuilder({ network: 'testnet' });
    await tx.initialize();
    
    const factory = new MockFactoryClient(tx, FACTORY_ADDRESS);
    const pool = await factory.getPool(TOKEN_A, TOKEN_B, 2);
    
    expect(pool).toBeDefined();
    expect(pool.feeTier).toBe(2);
    expect(pool.isActive).toBe(true);
  });
});
```

## API Reference

### mock-octra-hfhe

| Function | Description |
|----------|-------------|
| `generateKeyPair()` | Generate a new HFHE keypair |
| `encrypt(plaintext, keyPair)` | Encrypt a plaintext value |
| `decrypt(encrypted, keyPair)` | Decrypt a ciphertext |
| `encryptNumber(value, keyPair)` | Encrypt a number |
| `decryptNumber(encrypted, keyPair)` | Decrypt to a number |
| `simulateAdd(a, b)` | Homomorphic addition |
| `simulateSub(a, b)` | Homomorphic subtraction |
| `simulateMul(a, b)` | Homomorphic multiplication |
| `hasNoiseBudget(encrypted, op)` | Check noise budget |
| `reencrypt(encrypted, keyPair)` | Refresh noise budget |
| `isValidCiphertext(hex)` | Validate ciphertext format |
| `isValidPlaintext(value)` | Validate plaintext |

### mock-octra-sdk

| Class | Description |
|-------|-------------|
| `MockTransactionBuilder` | Transaction building without network |
| `MockFactoryClient` | Pool registry operations |
| `MockPairClient` | Liquidity and pool state |
| `MockRouterClient` | Swap operations |
| `MockShieldTokenClient` | Token operations |
| `MockAIEngineClient` | AI engine operations |

## Limitations

The mock packages are for **testing only** and have these limitations:

1. **No real encryption** - Ciphertext is just hex-encoded plaintext
2. **No network calls** - All operations are local
3. **Deterministic noise** - Noise budget decrements predictably
4. **Mock data** - Returned values are fabricated for testing

Do not use mock packages in production code.

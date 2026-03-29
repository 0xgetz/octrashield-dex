# Mock Implementation Guide

This guide explains how to use the mock packages (`mock-octra-hfhe` and `mock-octra-sdk`) for testing and development without requiring real cryptographic operations or network connectivity.

## Quick Start

### Step 1: Install Mock Packages

```bash
pnpm install mock-octra-hfhe mock-octra-sdk
```

### Step 2: Import Mock Modules

```typescript
// Instead of real SDK
import { generateKeyPair, encrypt, decrypt } from '@octrashield/dex-sdk';

// Use mock packages
import { generateKeyPair, encrypt, decrypt } from 'mock-octra-hfhe';
import { RouterClient, FactoryClient, PairClient } from 'mock-octra-sdk';
```

### Step 3: Use Identically

Mock packages use the same API signatures, so existing code works without changes:

```typescript
const keyPair = await generateKeyPair();
const encrypted = await encrypt(42, keyPair.publicKey);
const decrypted = await decrypt(encrypted, keyPair.secretKey);
console.log(decrypted.value); // 42
```

## API Compatibility

### HFHE Encryption (`mock-octra-hfhe`)

| Function | Real SDK | Mock Package | Notes |
|----------|----------|--------------|-------|
| `generateKeyPair()` | Full Paillier key generation | Instant key pair generation | Mock keys are smaller, faster |
| `encrypt(plaintext, publicKey)` | Homomorphic encryption | XOR-based encryption | Ciphertext format differs |
| `decrypt(ciphertext, secretKey)` | Full decryption | XOR-based decryption | Returns same plaintext |
| `encryptNumber(n, pk)` | Encrypts u64 | Stores plaintext directly | No real crypto |
| `decryptNumber(ct, sk)` | Decrypts to u64 | Returns stored plaintext | Deterministic |
| `simulateAdd(ct1, ct2)` | Homomorphic addition | Simple addition tracking | Noise budget decrements |
| `simulateSub(ct1, ct2)` | Homomorphic subtraction | Simple subtraction tracking | Noise budget decrements |
| `hasNoiseBudget(ct)` | Checks noise budget | Returns deterministic value | Starts at 120 |
| `reencrypt(ct, pk)` | Re-encryption | Returns same ciphertext | No-op for mock |
| `isValidCiphertext(ct)` | Validates ciphertext | Always returns true | Mock accepts any format |
| `isValidPlaintext(n)` | Validates plaintext | Checks u64 range | Same validation |
| Field arithmetic functions | Full Mersenne prime math | Simple modular arithmetic | Faster, less secure |

### SDK Clients (`mock-octra-sdk`)

| Client | Real SDK | Mock Package | Notes |
|--------|----------|--------------|-------|
| `TransactionBuilder` | Real network RPC calls | Returns mock receipts | No actual transactions |
| `FactoryClient` | Queries real pools | Returns deterministic pool list | 3 mock pools by default |
| `PairClient` | Real pool state, ticks | Mock pool data | Fixed liquidity, reserves |
| `RouterClient` | Real swap execution | Mock swap results | Simulates slippage, fees |
| `ShieldTokenClient` | Real token operations | Mock balances, transfers | Encrypted balance simulation |
| `AIEngineClient` | Real fee/volatility data | Mock dynamic values | Returns fixed values |

## Example Code Snippets

### Basic Encryption/Decryption

```typescript
import { generateKeyPair, encrypt, decrypt } from 'mock-octra-hfhe';

async function basicCrypto() {
  // Generate key pair (instant)
  const keyPair = await generateKeyPair();
  
  // Encrypt a value
  const plaintext = 1000;
  const encrypted = await encrypt(plaintext, keyPair.publicKey);
  
  // Decrypt back
  const decrypted = await decrypt(encrypted, keyPair.secretKey);
  console.log(`Decrypted: ${decrypted.value}`); // 1000
  console.log(`Noise budget: ${decrypted.noiseBudget}`); // 120
}
```

### Homomorphic Operations

```typescript
import { 
  generateKeyPair, 
  encryptNumber, 
  simulateAdd, 
  decryptNumber 
} from 'mock-octra-hfhe';

async function homomorphicAdd() {
  const keyPair = await generateKeyPair();
  
  // Encrypt two numbers
  const ct1 = await encryptNumber(100, keyPair.publicKey);
  const ct2 = await encryptNumber(50, keyPair.publicKey);
  
  // Add them homomorphically
  const ctSum = await simulateAdd(ct1, ct2);
  
  // Decrypt result
  const result = await decryptNumber(ctSum, keyPair.secretKey);
  console.log(`Sum: ${result.value}`); // 150
}
```

### Using Contract Clients

```typescript
import { 
  RouterClient, 
  FactoryClient, 
  PairClient,
  TransactionBuilder 
} from 'mock-octra-sdk';

async function dexOperations() {
  // Initialize clients (no network connection needed)
  const router = new RouterClient('mock-network');
  const factory = new FactoryClient('mock-network');
  
  // Get available pools
  const pools = await factory.getAllPools();
  console.log(`Found ${pools.length} pools`);
  
  // Get a quote for a swap
  const quote = await router.quoteExactInput({
    tokenIn: 'USDC',
    tokenOut: 'ETH',
    amountIn: 1000,
    fee: 3000
  });
  console.log(`Expected output: ${quote.amountOut}`);
  
  // Execute swap (mock - no real funds moved)
  const txBuilder = new TransactionBuilder('mock-network');
  const receipt = await router.swapExactInput(
    txBuilder,
    { tokenIn: 'USDC', tokenOut: 'ETH', amountIn: 1000 }
  );
  console.log(`Swap receipt: ${receipt.transactionHash}`);
}
```

## Switching Between Real and Mock

### Method 1: Import Aliasing

```typescript
// config.ts
const USE_MOCK = process.env.NODE_ENV !== 'production';

export const crypto = USE_MOCK 
  ? await import('mock-octra-hfhe')
  : await import('@octrashield/dex-sdk');

export const clients = USE_MOCK
  ? await import('mock-octra-sdk')
  : await import('@octrashield/dex-sdk');
```

### Method 2: Path Mapping (TypeScript)

In `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@octrashield/dex-sdk": ["./node_modules/mock-octra-sdk"],
      "@octrashield/dex-sdk/hfhe": ["./node_modules/mock-octra-hfhe"]
    }
  }
}
```

### Method 3: Environment Variable

```bash
# Use mock packages
export OCTRA_SDK_MOCK=true

# Then import normally
import { RouterClient } from '@octrashield/dex-sdk';
```

## Limitations

### Mock HFHE Limitations

- **No real security**: XOR encryption is not cryptographically secure
- **No homomorphic properties**: Operations are simulated, not mathematically homomorphic
- **Deterministic**: Same input always produces same output (no randomness)
- **Simplified noise budget**: Decrements by 1 per operation, not real noise analysis
- **No field arithmetic**: Uses simple modular math, not Mersenne prime fields

### Mock SDK Limitations

- **No real transactions**: All transactions are simulated, no blockchain interaction
- **Fixed data**: Pool states, reserves, and prices are deterministic
- **No network effects**: No actual liquidity, slippage, or market impact
- **No persistence**: State resets on each run
- **No real fees**: Fee calculations are simplified

## When to Use Each

### Use Mock Packages For:

- Unit tests and integration tests
- Local development without network setup
- CI/CD pipelines (no network dependency)
- Rapid prototyping and demos
- Learning the API without crypto overhead
- Debugging business logic without crypto complexity

### Use Real SDK For:

- Production deployments
- Real transactions with actual funds
- Security-sensitive operations
- Performance benchmarking
- Integration testing with real blockchain
- Any operation requiring actual homomorphic encryption

## Best Practices

1. **Always test with mock first**: Catch logic errors quickly
2. **Verify with real SDK before production**: Ensure compatibility
3. **Mock in CI/CD**: Faster, more reliable tests
4. **Use environment flags**: Easy switching between mock and real
5. **Don't mock security tests**: Test real crypto for security properties

## Troubleshooting

### Mock package not found

```bash
pnpm install mock-octra-hfhe mock-octra-sdk
```

### Type errors when switching

Ensure you're importing from the correct package:
```typescript
// Mock
import { encrypt } from 'mock-octra-hfhe';
// Real
import { encrypt } from '@octrashield/dex-sdk';
```

### Tests failing with mock

Check that your test logic doesn't depend on real cryptographic properties:
```typescript
// This works with mock
expect(decrypted.value).toBe(plaintext);

// This won't work with mock (ciphertexts differ)
expect(encrypted.ciphertext).not.toBe(plaintext);
```

## Additional Resources

- [SDK API Analysis](./SDK_API_ANALYSIS.md) - Complete API reference
- [Mock Package Source](./mock-octra-hfhe/) - HFHE mock implementation
- [Mock Package Source](./mock-octra-sdk/) - SDK clients mock implementation
- [Example Usage](./examples/test-mock-implementation.ts) - Full working examples

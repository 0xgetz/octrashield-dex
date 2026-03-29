/**
 * Example: Switching Between Real and Mock OctraShield SDK
 * 
 * This file demonstrates patterns for using mock packages in development
 * and tests while maintaining compatibility with the real SDK.
 */

// ============================================================================
// Pattern 1: Environment-based switching
// ============================================================================

// config.ts
const USE_MOCK = process.env.NODE_ENV === 'test' || process.env.USE_MOCK_SDK === 'true';

// Dynamic imports for switching
export async function getHFHE() {
  if (USE_MOCK) {
    return import('mock-octra-hfhe');
  }
  return import('@0xgetz/octrashield-sdk');
}

export async function getSDK() {
  if (USE_MOCK) {
    return import('mock-octra-sdk');
  }
  return import('@0xgetz/octrashield-sdk');
}

// ============================================================================
// Pattern 2: Factory function pattern
// ============================================================================

// sdk-factory.ts
import type { HfheKeyPair, Address, OctraShieldConfig } from '@0xgetz/octrashield-sdk';

export interface HFHEModule {
  generateKeyPair(): HfheKeyPair;
  encrypt(plaintext: bigint, keyPair: HfheKeyPair): any;
  decrypt(encrypted: any, keyPair: HfheKeyPair): any;
  // ... other methods
}

export function createHFHEModule(useMock: boolean = false): HFHEModule {
  if (useMock) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mock = require('mock-octra-hfhe');
    return mock;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const real = require('@0xgetz/octrashield-sdk');
  return real;
}

export interface SDKClients {
  TransactionBuilder: any;
  FactoryClient: any;
  PairClient: any;
  RouterClient: any;
  ShieldTokenClient: any;
  AIEngineClient: any;
}

export function createSDKClients(useMock: boolean = false): SDKClients {
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
  const real = require('@0xgetz/octrashield-sdk');
  return {
    TransactionBuilder: real.TransactionBuilder,
    FactoryClient: real.FactoryClient,
    PairClient: real.PairClient,
    RouterClient: real.RouterClient,
    ShieldTokenClient: real.ShieldTokenClient,
    AIEngineClient: real.AIEngineClient,
  };
}

// ============================================================================
// Pattern 3: Type-safe abstraction layer
// ============================================================================

// types/encryption.ts
export interface EncryptionService {
  generateKeyPair(): HfheKeyPair;
  encrypt(plaintext: bigint): EncryptedValue;
  decrypt(encrypted: EncryptedValue): bigint;
  add(a: EncryptedValue, b: EncryptedValue): EncryptedValue;
}

// services/encryption-service.ts
import { HfheKeyPair } from '@0xgetz/octrashield-sdk';
import type { EncryptedValue } from '../types/encryption';

export class EncryptionServiceImpl implements EncryptionService {
  private keyPair: HfheKeyPair;
  private hfhe: any;

  constructor(useMock: boolean = false) {
    this.hfhe = useMock 
      ? require('mock-octra-hfhe') 
      : require('@0xgetz/octrashield-sdk');
    this.keyPair = this.hfhe.generateKeyPair();
  }

  generateKeyPair(): HfheKeyPair {
    return this.keyPair;
  }

  encrypt(plaintext: bigint): EncryptedValue {
    return this.hfhe.encrypt(plaintext, this.keyPair);
  }

  decrypt(encrypted: EncryptedValue): bigint {
    const result = this.hfhe.decrypt(encrypted, this.keyPair);
    return result.value;
  }

  add(a: EncryptedValue, b: EncryptedValue): EncryptedValue {
    return this.hfhe.simulateAdd(a, b);
  }
}

// ============================================================================
// Pattern 4: Test utilities
// ============================================================================

// test-utils/mock-setup.ts
import { 
  MockTransactionBuilder, 
  MockFactoryClient,
  MockPairClient,
  createMockKeyPair,
  mockAddress,
  mockPoolId 
} from 'mock-octra-sdk';

export function setupMockEnvironment() {
  const tx = new MockTransactionBuilder({ network: 'testnet' });
  tx.initialize();
  
  const keyPair = createMockKeyPair();
  
  const factoryAddress = mockAddress('factory');
  const factory = new MockFactoryClient(tx, factoryAddress);
  
  return {
    tx,
    keyPair,
    factory,
    // Add other clients as needed
  };
}

export function createMockPool(tokenA?: string, tokenB?: string, feeTier?: number) {
  return {
    poolId: mockPoolId(tokenA || 'tokenA', tokenB || 'tokenB', feeTier || 2),
    token0: mockAddress('token0'),
    token1: mockAddress('token1'),
    feeTier: feeTier || 2,
    tickSpacing: 60,
    poolAddress: mockAddress('pool'),
    createdAtBlock: BigInt(1000000),
    isActive: true,
  };
}

// ============================================================================
// Pattern 5: Vitest setup
// ============================================================================

// test/setup.ts
import { beforeAll, afterAll } from 'vitest';

// Global mock setup for all tests
beforeAll(() => {
  process.env.USE_MOCK_SDK = 'true';
});

afterAll(() => {
  process.env.USE_MOCK_SDK = 'false';
});

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Using environment-based switching
 */
async function example1() {
  const hfhe = await getHFHE();
  const keyPair = hfhe.generateKeyPair();
  const encrypted = hfhe.encrypt(100n, keyPair);
  const decrypted = hfhe.decrypt(encrypted, keyPair);
  console.log('Decrypted:', decrypted.value);
}

/**
 * Example 2: Using factory functions
 */
function example2() {
  const hfhe = createHFHEModule(true); // Use mock
  const keyPair = hfhe.generateKeyPair();
  
  const clients = createSDKClients(true); // Use mock
  const { TransactionBuilder, FactoryClient } = clients;
  
  const tx = new TransactionBuilder({ network: 'testnet' });
  tx.initialize();
  
  const factory = new FactoryClient(tx, mockAddress('factory'));
}

/**
 * Example 3: Using in tests
 */
describe('Pool operations', () => {
  let tx: any;
  let factory: any;
  
  beforeAll(async () => {
    const { tx: txBuilder, factory: factoryClient } = setupMockEnvironment();
    tx = txBuilder;
    factory = factoryClient;
  });
  
  it('should create a pool', async () => {
    const pool = await factory.getPool(
      mockAddress('tokenA'),
      mockAddress('tokenB'),
      2
    );
    
    expect(pool).toBeDefined();
    expect(pool.isActive).toBe(true);
  });
});

/**
 * Example 4: Integration test with real SDK
 */
describe('Integration with real SDK', () => {
  // These tests use the real SDK (mock is disabled)
  beforeAll(() => {
    process.env.USE_MOCK_SDK = 'false';
  });
  
  it('should work with real network', async () => {
    const { TransactionBuilder, FactoryClient } = createSDKClients(false);
    // ... test with real network
  });
});

// ============================================================================
// Best Practices
// ============================================================================

/**
 * Best practices for using mock packages:
 * 
 * 1. Use mocks in unit tests - they're fast and deterministic
 * 2. Use real SDK in integration tests - test actual network behavior
 * 3. Keep mock and real APIs identical - easy switching
 * 4. Don't use mocks in production - they have no real encryption
 * 5. Mock network calls, not business logic - test your code, not the SDK
 * 6. Use factory functions for dependency injection - easy to swap implementations
 */

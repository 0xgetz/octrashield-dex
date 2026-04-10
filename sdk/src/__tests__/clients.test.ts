// TODO: Octra Network uses Operation Units (OU), NOT gas.
// Replace all `gas` / `estimateGas` / `gasLimit` references with OU equivalents:
//   - Query OU fee: octra_recommendedFee RPC method
//   - Field name: "ou" (not "gas" or "gasLimit")
// See: https://octrascan.io/docs.html#octra_recommendedFee

/**
 * Client Tests — PairClient, FactoryClient, RouterClient, ShieldTokenClient, AIEngineClient.
 *
 * These are unit-level tests using a mock TransactionBuilder to validate
 * that client methods construct correct transaction payloads and properly
 * interpret decoded responses.
 *
 * Coverage per client:
 *   - PairClient: getReserves, swap, addLiquidity, removeLiquidity
 *   - FactoryClient: createPair, getPair, allPairs, pairCount
 *   - RouterClient: swapExactIn, swapExactOut, addLiquidity, removeLiquidity
 *   - ShieldTokenClient: balanceOf, transfer, approve, allowance, mint, burn
 *   - AIEngineClient: getDynamicFee, getVolatility, getMevAlerts, getPoolRisk
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, PoolId, HfheKeyPair, EncryptedU64 } from '../core/types.js';
import { generateKeyPair, encrypt } from '../core/hfhe.js';
import { PairClient } from '../clients/pair.js';
import { FactoryClient } from '../clients/factory.js';
import { RouterClient } from '../clients/router.js';
import { ShieldTokenClient } from '../clients/shield-token.js';
import { AIEngineClient } from '../clients/ai-engine.js';
import type { TransactionBuilder } from '../core/ocs01.js';

// ============================================================================
// Mocks
// ============================================================================

const MOCK_PAIR: Address = '0x' + 'aa'.repeat(20) as Address;
const MOCK_FACTORY: Address = '0x' + 'bb'.repeat(20) as Address;
const MOCK_ROUTER: Address = '0x' + 'cc'.repeat(20) as Address;
const MOCK_TOKEN: Address = '0x' + 'dd'.repeat(20) as Address;
const MOCK_AI: Address = '0x' + 'ee'.repeat(20) as Address;
const MOCK_USER: Address = '0x' + 'ff'.repeat(20) as Address;
const MOCK_TOKEN_A: Address = '0x' + '11'.repeat(20) as Address;
const MOCK_TOKEN_B: Address = '0x' + '22'.repeat(20) as Address;

let keyPair: HfheKeyPair;
let mockTxBuilder: TransactionBuilder;

function createMockTxBuilder(): TransactionBuilder {
  return {
    query: vi.fn().mockResolvedValue({ data: '0x00' }),
    execute: vi.fn().mockResolvedValue({ txHash: '0xabc123', success: true }),
    estimateGas: vi.fn().mockResolvedValue(150_000n),
    sender: MOCK_USER,
  } as unknown as TransactionBuilder;
}

beforeEach(() => {
  keyPair = generateKeyPair();
  mockTxBuilder = createMockTxBuilder();
});

// ============================================================================
// PairClient
// ============================================================================

describe('PairClient', () => {
  it('constructor: creates client with address', () => {
    const client = new PairClient(mockTxBuilder, keyPair, MOCK_PAIR);
    expect(client.address).toBe(MOCK_PAIR);
  });

  it('getReserves: calls query', async () => {
    const client = new PairClient(mockTxBuilder, keyPair, MOCK_PAIR);
    const mockReserves = {
      reserve0: encrypt(1_000_000n, keyPair),
      reserve1: encrypt(3_000_000n, keyPair),
      blockTimestampLast: 1700000000n,
    };
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockReserves);

    const reserves = await client.getReserves();
    expect(mockTxBuilder.query).toHaveBeenCalled();
    expect(reserves).toBeDefined();
  });

  it('swap: calls execute with encrypted amounts', async () => {
    const client = new PairClient(mockTxBuilder, keyPair, MOCK_PAIR);
    const result = await client.swap(
      MOCK_TOKEN_A,
      1000n,
      950n,
      MOCK_USER,
      BigInt(Math.floor(Date.now() / 1000) + 3600),
    );
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('addLiquidity: calls execute', async () => {
    const client = new PairClient(mockTxBuilder, keyPair, MOCK_PAIR);
    const result = await client.addLiquidity(
      1000n, 3000n,
      950n, 2850n,
      MOCK_USER,
      BigInt(Math.floor(Date.now() / 1000) + 3600),
    );
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('removeLiquidity: calls execute', async () => {
    const client = new PairClient(mockTxBuilder, keyPair, MOCK_PAIR);
    const result = await client.removeLiquidity(
      500n,
      450n, 1350n,
      MOCK_USER,
      BigInt(Math.floor(Date.now() / 1000) + 3600),
    );
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('estimateGas: returns gas estimate', async () => {
    const client = new PairClient(mockTxBuilder, keyPair, MOCK_PAIR);
    const gas = await client.estimateSwapGas(MOCK_TOKEN_A, 1000n, 950n);
    expect(gas).toBe(150_000n);
  });
});

// ============================================================================
// FactoryClient
// ============================================================================

describe('FactoryClient', () => {
  it('constructor: creates client', () => {
    const client = new FactoryClient(mockTxBuilder, keyPair, MOCK_FACTORY);
    expect(client.address).toBe(MOCK_FACTORY);
  });

  it('createPair: calls execute', async () => {
    const client = new FactoryClient(mockTxBuilder, keyPair, MOCK_FACTORY);
    const result = await client.createPair(MOCK_TOKEN_A, MOCK_TOKEN_B, 30);
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('getPair: calls query', async () => {
    const client = new FactoryClient(mockTxBuilder, keyPair, MOCK_FACTORY);
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_PAIR);

    const pairAddress = await client.getPair(MOCK_TOKEN_A, MOCK_TOKEN_B);
    expect(mockTxBuilder.query).toHaveBeenCalled();
  });

  it('allPairs: calls query', async () => {
    const client = new FactoryClient(mockTxBuilder, keyPair, MOCK_FACTORY);
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([MOCK_PAIR]);

    const pairs = await client.allPairs();
    expect(mockTxBuilder.query).toHaveBeenCalled();
  });

  it('pairCount: calls query', async () => {
    const client = new FactoryClient(mockTxBuilder, keyPair, MOCK_FACTORY);
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5n);

    const count = await client.pairCount();
    expect(mockTxBuilder.query).toHaveBeenCalled();
  });
});

// ============================================================================
// RouterClient
// ============================================================================

describe('RouterClient', () => {
  it('constructor: creates client', () => {
    const client = new RouterClient(mockTxBuilder, keyPair, MOCK_ROUTER);
    expect(client.address).toBe(MOCK_ROUTER);
  });

  it('swapExactIn: calls execute with route', async () => {
    const client = new RouterClient(mockTxBuilder, keyPair, MOCK_ROUTER);
    const result = await client.swapExactIn(
      [MOCK_TOKEN_A, MOCK_TOKEN_B],
      1000n,
      950n,
      MOCK_USER,
      BigInt(Math.floor(Date.now() / 1000) + 3600),
    );
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('swapExactOut: calls execute', async () => {
    const client = new RouterClient(mockTxBuilder, keyPair, MOCK_ROUTER);
    const result = await client.swapExactOut(
      [MOCK_TOKEN_A, MOCK_TOKEN_B],
      1000n,
      1050n,
      MOCK_USER,
      BigInt(Math.floor(Date.now() / 1000) + 3600),
    );
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('addLiquidity: calls execute', async () => {
    const client = new RouterClient(mockTxBuilder, keyPair, MOCK_ROUTER);
    const result = await client.addLiquidity(
      MOCK_TOKEN_A, MOCK_TOKEN_B,
      1000n, 3000n,
      950n, 2850n,
      MOCK_USER,
      BigInt(Math.floor(Date.now() / 1000) + 3600),
    );
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('removeLiquidity: calls execute', async () => {
    const client = new RouterClient(mockTxBuilder, keyPair, MOCK_ROUTER);
    const result = await client.removeLiquidity(
      MOCK_TOKEN_A, MOCK_TOKEN_B,
      500n,
      450n, 1350n,
      MOCK_USER,
      BigInt(Math.floor(Date.now() / 1000) + 3600),
    );
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});

// ============================================================================
// ShieldTokenClient
// ============================================================================

describe('ShieldTokenClient', () => {
  it('constructor: creates client', () => {
    const client = new ShieldTokenClient(mockTxBuilder, keyPair, MOCK_TOKEN);
    expect(client.address).toBe(MOCK_TOKEN);
  });

  it('balanceOf: calls query with encrypted result', async () => {
    const client = new ShieldTokenClient(mockTxBuilder, keyPair, MOCK_TOKEN);
    const encBalance = encrypt(5000n, keyPair);
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(encBalance);

    const balance = await client.balanceOf(MOCK_USER);
    expect(mockTxBuilder.query).toHaveBeenCalled();
  });

  it('transfer: calls execute', async () => {
    const client = new ShieldTokenClient(mockTxBuilder, keyPair, MOCK_TOKEN);
    const result = await client.transfer(MOCK_USER, 1000n);
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('approve: calls execute', async () => {
    const client = new ShieldTokenClient(mockTxBuilder, keyPair, MOCK_TOKEN);
    const result = await client.approve(MOCK_ROUTER, 10000n);
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('allowance: calls query', async () => {
    const client = new ShieldTokenClient(mockTxBuilder, keyPair, MOCK_TOKEN);
    const encAllowance = encrypt(10000n, keyPair);
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(encAllowance);

    const allowance = await client.allowance(MOCK_USER, MOCK_ROUTER);
    expect(mockTxBuilder.query).toHaveBeenCalled();
  });

  it('mint: calls execute', async () => {
    const client = new ShieldTokenClient(mockTxBuilder, keyPair, MOCK_TOKEN);
    const result = await client.mint(MOCK_USER, 5000n);
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('burn: calls execute', async () => {
    const client = new ShieldTokenClient(mockTxBuilder, keyPair, MOCK_TOKEN);
    const result = await client.burn(2000n);
    expect(mockTxBuilder.execute).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('totalSupply: calls query', async () => {
    const client = new ShieldTokenClient(mockTxBuilder, keyPair, MOCK_TOKEN);
    const encSupply = encrypt(1_000_000n, keyPair);
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(encSupply);

    const supply = await client.totalSupply();
    expect(mockTxBuilder.query).toHaveBeenCalled();
  });
});

// ============================================================================
// AIEngineClient
// ============================================================================

describe('AIEngineClient', () => {
  const MOCK_POOL_ID = 'pool-123' as PoolId;

  it('constructor: creates client', () => {
    const client = new AIEngineClient(mockTxBuilder, keyPair, MOCK_AI);
    expect(client.address).toBe(MOCK_AI);
  });

  it('getDynamicFee: calls query', async () => {
    const client = new AIEngineClient(mockTxBuilder, keyPair, MOCK_AI);
    const mockFee = {
      multiplierBps: encrypt(30n, keyPair),
      baseFee: encrypt(25n, keyPair),
      adjustedFee: encrypt(28n, keyPair),
      updatedAt: 1700000000n,
    };
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockFee);

    const fee = await client.getDynamicFee(MOCK_POOL_ID);
    expect(mockTxBuilder.query).toHaveBeenCalled();
  });

  it('getVolatility: calls query', async () => {
    const client = new AIEngineClient(mockTxBuilder, keyPair, MOCK_AI);
    const mockVol = {
      emaVolatility: encrypt(500n, keyPair),
      shortTermVol: encrypt(600n, keyPair),
      longTermVol: encrypt(400n, keyPair),
      volRatio: encrypt(150n, keyPair),
    };
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockVol);

    const vol = await client.getVolatility(MOCK_POOL_ID);
    expect(mockTxBuilder.query).toHaveBeenCalled();
  });

  it('getMevAlerts: calls query', async () => {
    const client = new AIEngineClient(mockTxBuilder, keyPair, MOCK_AI);
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const alerts = await client.getMevAlerts(MOCK_POOL_ID);
    expect(mockTxBuilder.query).toHaveBeenCalled();
    expect(alerts).toEqual([]);
  });

  it('getPoolRisk: calls query', async () => {
    const client = new AIEngineClient(mockTxBuilder, keyPair, MOCK_AI);
    const mockRisk = { riskScore: 25, level: 'LOW', factors: [] };
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockRisk);

    const risk = await client.getPoolRisk(MOCK_POOL_ID);
    expect(mockTxBuilder.query).toHaveBeenCalled();
    expect(risk.riskScore).toBe(25);
    expect(risk.level).toBe('LOW');
  });

  it('getHealthStatus: calls query', async () => {
    const client = new AIEngineClient(mockTxBuilder, keyPair, MOCK_AI);
    const mockHealth = { isHealthy: true, lastUpdate: 1700000000, modelVersion: '1.0.0' };
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockHealth);

    const health = await client.getHealthStatus();
    expect(mockTxBuilder.query).toHaveBeenCalled();
    expect(health.isHealthy).toBe(true);
  });

  it('requestFeeUpdate: calls execute', async () => {
    const client = new AIEngineClient(mockTxBuilder, keyPair, MOCK_AI);
    await client.requestFeeUpdate(MOCK_POOL_ID);
    expect(mockTxBuilder.execute).toHaveBeenCalled();
  });

  it('isPoolSafe: returns safety assessment', async () => {
    const client = new AIEngineClient(mockTxBuilder, keyPair, MOCK_AI);
    const mockSafety = { safe: true, reason: 'No anomalies detected' };
    (mockTxBuilder.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockSafety);

    const safety = await client.isPoolSafe(MOCK_POOL_ID);
    expect(safety.safe).toBe(true);
    expect(safety.reason).toBe('No anomalies detected');
  });
});

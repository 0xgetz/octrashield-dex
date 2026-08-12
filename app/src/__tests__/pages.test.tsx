/**
 * Page Render Tests — Smoke tests for all route pages.
 *
 * Wraps each page in MemoryRouter + mocked OctraProvider.
 * Verifies:
 *   - Page renders without crash
 *   - Key headings and sections present
 *   - Interactive elements exist
 *   - Loading states render correctly
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

import { Swap } from '@/pages/Swap.js';
import { Pools } from '@/pages/Pools.js';
import { PoolDetail } from '@/pages/PoolDetail.js';
import { AddLiquidity } from '@/pages/AddLiquidity.js';
import { Positions } from '@/pages/Positions.js';
import { Dashboard } from '@/pages/Dashboard.js';
import { Portfolio } from '@/pages/Portfolio.js';

// ============================================================================
// Mock OctraProvider Context
// ============================================================================

vi.mock('@/providers/WalletProvider.js', () => ({
  useWallet: () => ({
    status: 'connected',
    address: 'oct2HCucoJFXTuxi31o7HctXzAaUmhPPyucnMwrrpMo4TjM',
    chainId: 'octra-devnet-1',
    keyPair: null,
    displayAddress: 'oct2HCucoJFXTuxi31o7HctXzAaUmhPPyucnMwrrpMo4TjM',
    hasKeys: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    regenerateKeys: vi.fn(),
    error: null,
  }),
}));

vi.mock('@/providers/OctraProvider.js', () => ({
  useOctra: () => ({
    isConnected: true,
    address: 'octra1test',
    connect: vi.fn(),
    disconnect: vi.fn(),
    sdk: {
      router: {
        getQuote: vi.fn().mockResolvedValue({
          estimatedOutput: '9870',
          priceImpact: 0.15,
          route: [],
        }),
        swap: vi.fn().mockResolvedValue({ txHash: '0x1', success: true }),
      },
      factory: {
        allPools: vi.fn().mockResolvedValue([
          {
            address: 'pool_001', token0: 'WETH', token1: 'USDC',
            feeBps: 30, tvl: '5200000', volume24h: '1100000', apr: 12.5,
          },
          {
            address: 'pool_002', token0: 'WETH', token1: 'DAI',
            feeBps: 30, tvl: '3100000', volume24h: '850000', apr: 9.2,
          },
        ]),
        getPool: vi.fn().mockResolvedValue({
          address: 'pool_001', token0: 'WETH', token1: 'USDC',
          feeBps: 30, tvl: '5200000', volume24h: '1100000',
          reserve0: '1700', reserve1: '5100000', tick: 200,
        }),
      },
      ai: {
        getDynamicFee: vi.fn().mockResolvedValue({ feeBps: 42, confidence: 0.91 }),
        getMevThreat: vi.fn().mockResolvedValue({
          threatLevel: 'low', score: 0.12, indicators: [],
        }),
        getVolatilityMetrics: vi.fn().mockResolvedValue({
          currentVolatility: 0.028, emaShort: 0.031, emaLong: 0.025, trend: 'stable',
        }),
        getRebalanceSuggestion: vi.fn().mockResolvedValue({
          suggestedLower: -600, suggestedUpper: 800,
        }),
      },
      token: {
        balanceOf: vi.fn().mockResolvedValue('enc_balance'),
        metadata: vi.fn().mockResolvedValue({ name: 'Shield', symbol: 'SHIELD', decimals: 18 }),
      },
    },
    keyFingerprint: 'abcdef01',
    hfheActive: true,
    balances: {
      WETH: { raw: '5000000000', formatted: '5.0', usd: '15000' },
      USDC: { raw: '10000000000', formatted: '10000', usd: '10000' },
    },
    positions: [
      {
        id: 1, pool: 'pool_001', token0: 'WETH', token1: 'USDC',
        tickLower: -500, tickUpper: 500, liquidity: '50000',
        inRange: true, feesEarned0: '12', feesEarned1: '36000',
      },
    ],
  }),
}));

/** Helper to render a page within router context. */
function renderPage(element: React.ReactElement, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>
  );
}

function renderWithParams(element: React.ReactElement, path: string, route: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

// ============================================================================
// Swap Page
// ============================================================================

describe('Swap Page', () => {
  it('renders swap interface', () => {
    renderPage(<Swap />);
    expect(screen.getByRole('heading', { name: 'Swap' })).toBeInTheDocument();
  });

  it('has token input fields', () => {
    renderPage(<Swap />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('has swap button', () => {
    renderPage(<Swap />);
    const btn = screen.getByRole('button', { name: 'Enter Amount' });
    expect(btn).toBeInTheDocument();
  });

  it('has slippage settings', () => {
    renderPage(<Swap />);
    expect(screen.getByRole('button', { name: 'Swap settings' })).toBeInTheDocument();
  });

  it('has dark pool toggle', () => {
    renderPage(<Swap />);
    expect(screen.getByText(/dark pool/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Pools Page
// ============================================================================

describe('Pools Page', () => {
  it('renders pool list', async () => {
    renderPage(<Pools />);
    await waitFor(() => {
      expect(screen.getAllByText(/OCTA/).length).toBeGreaterThan(0);
    });
  });

  it('displays pool cards or rows', async () => {
    renderPage(<Pools />);
    await waitFor(() => {
      expect(screen.getAllByText(/OCTA/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/sUSD/).length).toBeGreaterThan(0);
    });
  });

  it('has search/filter input', () => {
    renderPage(<Pools />);
    const search = screen.getByPlaceholderText(/search|filter/i);
    expect(search).toBeInTheDocument();
  });

  it('has add liquidity link', async () => {
    renderPage(<Pools />);
    await waitFor(() => {
      const links = screen.getAllByText(/new position/i);
      expect(links.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Pool Detail Page
// ============================================================================

describe('PoolDetail Page', () => {
  it('renders pool stats', async () => {
    renderWithParams(<PoolDetail />, '/pools/pool_001', '/pools/:poolId');
    await waitFor(() => {
      expect(screen.getByText('TVL')).toBeInTheDocument();
    });
  });

  it('shows token pair', async () => {
    renderWithParams(<PoolDetail />, '/pools/pool_001', '/pools/:poolId');
    await waitFor(() => {
      expect(screen.getAllByText(/OCTA\/sUSD/).length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Add Liquidity Page
// ============================================================================

describe('AddLiquidity Page', () => {
  it('renders liquidity form', () => {
    renderPage(<AddLiquidity />);
    expect(screen.getAllByText(/add liquidity/i).length).toBeGreaterThan(0);
  });

  it('has token amount inputs', () => {
    renderPage(<AddLiquidity />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('has fee tier selection', () => {
    renderPage(<AddLiquidity />);
    expect(screen.getByText('Fee Tier')).toBeInTheDocument();
  });

  it('has price range controls', () => {
    renderPage(<AddLiquidity />);
    expect(screen.getByText('Set Price Range')).toBeInTheDocument();
  });

  it('has full range toggle', () => {
    renderPage(<AddLiquidity />);
    expect(screen.getAllByText('Full Range').length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Positions Page
// ============================================================================

describe('Positions Page', () => {
  it('renders positions list', async () => {
    renderPage(<Positions />);
    await waitFor(() => {
      expect(screen.getByText('Your Positions')).toBeInTheDocument();
    });
  });

  it('shows position card with token pair', async () => {
    renderPage(<Positions />);
    await waitFor(() => {
      expect(screen.getAllByText(/OCTA\/sUSD/).length).toBeGreaterThan(0);
    });
  });

  it('shows in-range status', async () => {
    renderPage(<Positions />);
    await waitFor(() => {
      expect(screen.getAllByText(/In Range|Out of Range/i).length).toBeGreaterThan(0);
    });
  });

  it('has collect fees button', async () => {
    renderPage(<Positions />);
    await waitFor(() => {
      const buttons = screen.getAllByText(/Collect Fees/i);
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// AI Dashboard Page
// ============================================================================

describe('Dashboard Page', () => {
  it('renders dashboard heading', () => {
    renderPage(<Dashboard />);
    expect(screen.getByRole('heading', { name: 'AI Dashboard' })).toBeInTheDocument();
  });

  it('shows dynamic fee section', async () => {
    renderPage(<Dashboard />);
    await waitFor(() => {
      expect(screen.getAllByText(/Dynamic Fee|Dynamic Fees/i).length).toBeGreaterThan(0);
    });
  });

  it('shows MEV detection section', async () => {
    renderPage(<Dashboard />);
    await waitFor(() => {
      expect(screen.getAllByText(/MEV|threat/i).length).toBeGreaterThan(0);
    });
  });

  it('shows volatility section', async () => {
    renderPage(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText(/volatility/i)).toBeInTheDocument();
    });
  });

  it('has tab navigation', () => {
    renderPage(<Dashboard />);
    // Should have tabs for fees, MEV, volatility, rebalance
    const tabs = screen.getAllByRole('button');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Portfolio Page
// ============================================================================

describe('Portfolio Page', () => {
  it('renders portfolio heading', () => {
    renderPage(<Portfolio />);
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument();
  });

  it('shows token balances', async () => {
    renderPage(<Portfolio />);
    await waitFor(() => {
      expect(screen.getAllByText(/OCTA/).length).toBeGreaterThan(0);
    });
  });

  it('shows encrypted total value', () => {
    renderPage(<Portfolio />);
    // Total value should be encrypted by default
    expect(document.querySelector('[class*="encrypted-value"]')).toBeTruthy();
  });

  it('shows wallet address', () => {
    renderPage(<Portfolio />);
    expect(screen.getByText(/oct2HCucoJFXTuxi31o7HctXzAaUmhPPyucnMwrrpMo4TjM/)).toBeInTheDocument();
  });

  it('shows HFHE key status', () => {
    renderPage(<Portfolio />);
    expect(screen.getByText(/HFHE Keys Active|Keys Not Derived/i)).toBeInTheDocument();
  });

  it('has quick action buttons', () => {
    renderPage(<Portfolio />);
    expect(screen.getAllByRole('button', { name: /swap|send|receive/i }).length).toBeGreaterThan(0);
  });
});

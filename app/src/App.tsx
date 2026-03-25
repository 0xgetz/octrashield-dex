/**
 * App — Root component with routing and providers.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { OctraProvider } from '@/providers/OctraProvider.js';
import { Layout } from '@/components/layout/Layout.js';

// Lazy-loaded pages
import { Swap } from '@/pages/Swap.js';
import { Pools } from '@/pages/Pools.js';
import { PoolDetail } from '@/pages/PoolDetail.js';
import { AddLiquidity } from '@/pages/AddLiquidity.js';
import { Positions } from '@/pages/Positions.js';
import { Dashboard } from '@/pages/Dashboard.js';
import { Portfolio } from '@/pages/Portfolio.js';

export function App() {
  return (
    <OctraProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Default redirect to swap */}
            <Route index element={<Navigate to="/swap" replace />} />

            {/* Core pages */}
            <Route path="/swap" element={<Swap />} />
            <Route path="/pools" element={<Pools />} />
            <Route path="/pools/:poolId" element={<PoolDetail />} />
            <Route path="/add-liquidity" element={<AddLiquidity />} />
            <Route path="/add-liquidity/:poolId" element={<AddLiquidity />} />
            <Route path="/positions" element={<Positions />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/swap" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </OctraProvider>
  );
}

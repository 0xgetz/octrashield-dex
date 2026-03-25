/**
 * Layout — Application shell with header, content area, and footer.
 * Includes the mesh background and noise overlay for the dark theme.
 */

import { Outlet } from 'react-router-dom';
import { Header } from './Header.js';
import { Footer } from './Footer.js';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-900">
      {/* Background layers */}
      <div className="fixed inset-0 bg-mesh pointer-events-none" />
      <div className="fixed inset-0 bg-noise pointer-events-none" />

      {/* Header */}
      <Header />

      {/* Main content */}
      <main className="relative flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

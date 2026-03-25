/**
 * Header — Top navigation bar with logo, nav links, network badge, and wallet connect.
 */

import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useWallet } from '@/providers/WalletProvider.js';
import { Button, StatusBadge } from '@/components/common/index.js';

const NAV_ITEMS = [
  { path: '/swap',       label: 'Swap' },
  { path: '/pools',      label: 'Pools' },
  { path: '/positions',  label: 'Positions' },
  { path: '/dashboard',  label: 'AI Dashboard' },
  { path: '/portfolio',  label: 'Portfolio' },
] as const;

export function Header() {
  const location = useLocation();
  const { status, displayAddress, connect, disconnect, hasKeys } = useWallet();

  return (
    <header className="sticky top-0 z-[100] border-b border-surface-500/15 bg-surface-900/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            {/* Shield icon */}
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-octra-500 to-shield-500 opacity-80" />
              <div className="absolute inset-[3px] rounded-[5px] bg-surface-900 flex items-center justify-center">
                <svg className="w-4 h-4 text-octra-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <span className="text-lg font-bold text-gradient-brand hidden sm:block">
              OctraShield
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ path, label }) => {
              const isActive = location.pathname === path ||
                (path !== '/' && location.pathname.startsWith(path));
              return (
                <Link
                  key={path}
                  to={path}
                  className={clsx(
                    'px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200',
                    isActive
                      ? 'text-octra-400 bg-octra-500/10'
                      : 'text-surface-300 hover:text-surface-100 hover:bg-surface-700/40'
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right side: network + wallet */}
          <div className="flex items-center gap-3">
            {/* Network badge */}
            <StatusBadge variant="info" pulse size="sm">
              Testnet
            </StatusBadge>

            {/* Privacy shield status */}
            {hasKeys && (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-shield-500/10">
                <svg className="w-3.5 h-3.5 shield-active" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 1l8 4v5c0 4.418-3.582 8-8 10-4.418-2-8-5.582-8-10V5l8-4z" clipRule="evenodd" />
                </svg>
                <span className="text-2xs font-medium text-shield-400">HFHE Active</span>
              </div>
            )}

            {/* Wallet button */}
            {status === 'connected' && displayAddress ? (
              <button
                onClick={disconnect}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-800/60 border border-surface-500/20 hover:border-surface-500/40 transition-all text-sm"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-mono text-surface-100">{displayAddress}</span>
              </button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={connect}
                loading={status === 'connecting'}
              >
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile navigation */}
      <div className="md:hidden border-t border-surface-500/15 overflow-x-auto">
        <nav className="flex items-center gap-1 px-4 py-2">
          {NAV_ITEMS.map(({ path, label }) => {
            const isActive = location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors',
                  isActive
                    ? 'text-octra-400 bg-octra-500/10'
                    : 'text-surface-400 hover:text-surface-200'
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

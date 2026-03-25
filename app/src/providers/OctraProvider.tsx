/**
 * OctraProvider — SDK Initialization & Global State
 *
 * Wraps the SDK's useOctraShield hook with the wallet provider,
 * notification system, and app-level configuration.
 * All child components can access SDK clients via useOctra().
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  OctraShieldConfig,
  Address,
  HfheKeyPair,
} from '@octrashield/dex-sdk';
import { useWallet, WalletProvider } from './WalletProvider.js';

// ============================================================================
// Types
// ============================================================================

export interface OctraContextValue {
  /** SDK configuration */
  config: OctraShieldConfig;
  /** Whether the SDK is fully initialized (wallet + keys) */
  isReady: boolean;
  /** Connected address */
  address: Address | null;
  /** HFHE key pair */
  keyPair: HfheKeyPair | null;
  /** Current network name */
  network: string;
  /** Contract addresses */
  contracts: {
    factory: Address | null;
    router: Address | null;
    aiEngine: Address | null;
  };
  /** Notification helpers */
  notify: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    warning: (msg: string) => void;
    info: (msg: string) => void;
  };
  /** Active notifications */
  notifications: Notification[];
  /** Dismiss a notification */
  dismissNotification: (id: string) => void;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
}

const OctraContext = createContext<OctraContextValue | null>(null);

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: OctraShieldConfig = {
  network: 'octra-testnet',
  autoRefreshMs: 15_000,
  debug: import.meta.env.DEV,
};

// ============================================================================
// Inner Provider (needs wallet context)
// ============================================================================

interface InnerProviderProps {
  children: ReactNode;
  config: OctraShieldConfig;
}

function InnerProvider({ children, config }: InnerProviderProps) {
  const { address, keyPair, status } = useWallet();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    if (notifications.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setNotifications((prev) =>
        prev.filter((n) => now - n.timestamp < 5000)
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [notifications.length]);

  const addNotification = (type: Notification['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNotifications((prev) => [
      ...prev.slice(-4), // Keep max 5 notifications
      { id, type, message, timestamp: Date.now() },
    ]);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const value = useMemo<OctraContextValue>(
    () => ({
      config,
      isReady: status === 'connected' && !!keyPair,
      address,
      keyPair,
      network: config.network ?? 'octra-testnet',
      contracts: {
        factory: (config.contracts?.factory ?? null) as Address | null,
        router: (config.contracts?.router ?? null) as Address | null,
        aiEngine: (config.contracts?.aiEngine ?? null) as Address | null,
      },
      notify: {
        success: (msg: string) => addNotification('success', msg),
        error: (msg: string) => addNotification('error', msg),
        warning: (msg: string) => addNotification('warning', msg),
        info: (msg: string) => addNotification('info', msg),
      },
      notifications,
      dismissNotification,
    }),
    [config, status, address, keyPair, notifications]
  );

  return (
    <OctraContext.Provider value={value}>
      {children}

      {/* Toast notification overlay */}
      {notifications.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[500] flex flex-col gap-2 max-w-sm">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`
                animate-slide-up px-4 py-3 rounded-xl text-sm font-medium
                backdrop-blur-md border shadow-lg cursor-pointer
                ${n.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : ''}
                ${n.type === 'error'   ? 'bg-red-500/10 border-red-500/30 text-red-400' : ''}
                ${n.type === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : ''}
                ${n.type === 'info'    ? 'bg-octra-500/10 border-octra-500/30 text-octra-400' : ''}
              `}
              onClick={() => dismissNotification(n.id)}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}
    </OctraContext.Provider>
  );
}

// ============================================================================
// Public Provider
// ============================================================================

export interface OctraProviderProps {
  children: ReactNode;
  config?: Partial<OctraShieldConfig>;
}

export function OctraProvider({ children, config }: OctraProviderProps) {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config]
  );

  return (
    <WalletProvider>
      <InnerProvider config={mergedConfig}>
        {children}
      </InnerProvider>
    </WalletProvider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useOctra(): OctraContextValue {
  const ctx = useContext(OctraContext);
  if (!ctx) {
    throw new Error('useOctra must be used within an OctraProvider');
  }
  return ctx;
}

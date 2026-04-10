/**
 * WalletProvider — Wallet Connection State Management
 *
 * Manages wallet lifecycle: connect, disconnect, account switching,
 * and HFHE key derivation from the wallet signature.
 *
 * In production, integrates with browser extension wallets.
 * For development, provides a mock wallet with deterministic keys.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Address, HfheKeyPair } from '@octrashield/dex-sdk';

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WalletContextValue {
  /** Current connection status */
  status: ConnectionStatus;
  /** Connected wallet address (null if disconnected) */
  address: Address | null;
  /** Derived HFHE key pair for encryption (null if not derived) */
  keyPair: HfheKeyPair | null;
  /** Chain ID of the connected network */
  // TODO: Octra Network does not use numeric chain IDs (not EVM-compatible).
  // Replace number with string once wallet integration is updated to use
  // octra_nonce / node_status (returns version string "v3.0.0-irmin").
  // See: https://octrascan.io/docs.html#node_status
  chainId: string | null; // was: number | null (EVM assumption)
  /** Truncated address for display: 0x1234...abcd */
  displayAddress: string | null;
  /** Connect wallet — triggers browser extension prompt */
  connect: () => Promise<void>;
  /** Disconnect and clear state */
  disconnect: () => void;
  /** Derive HFHE keys from wallet signature (one-time per session) */
  deriveKeys: () => Promise<void>;
  /** Whether HFHE keys have been derived */
  hasKeys: boolean;
  /** Last error message */
  error: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// ============================================================================
// Mock Wallet (Development)
// ============================================================================

const MOCK_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28' as Address;
const MOCK_CHAIN_ID = 9999; // Octra testnet

/** Generate deterministic mock HFHE keys from address */
function deriveMockKeys(address: Address): HfheKeyPair {
  const encoder = new TextEncoder();
  const seed = encoder.encode(`octrashield-hfhe-${address}`);
  // In production, this is derived from a wallet signature over a fixed message
  const publicKey = new Uint8Array(32);
  const secretKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    publicKey[i] = seed[i % seed.length] ^ 0xaa;
    secretKey[i] = seed[i % seed.length] ^ 0x55;
  }
  return {
    publicKey,
    secretKey,
    fingerprint: address.slice(2, 10).toUpperCase(),
  };
}

function truncateAddress(addr: Address): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ============================================================================
// Provider Component
// ============================================================================

export interface WalletProviderProps {
  children: ReactNode;
  /** Use mock wallet for development (default: true in dev) */
  useMock?: boolean;
}

export function WalletProvider({ children, useMock = true }: WalletProviderProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [address, setAddress] = useState<Address | null>(null);
  const [keyPair, setKeyPair] = useState<HfheKeyPair | null>(null);
  // TODO: Octra chainId is a string version ("v3.0.0-irmin"), not a number.
  const [chainId, setChainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Persist connection across page reloads
  useEffect(() => {
    const saved = localStorage.getItem('octra-wallet');
    if (saved) {
      try {
        const { address: addr, chainId: cid } = JSON.parse(saved);
        setAddress(addr as Address);
        setChainId(cid);
        setStatus('connected');
      } catch {
        localStorage.removeItem('octra-wallet');
      }
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');

    try {
      if (useMock) {
        // Simulate connection delay
        await new Promise((r) => setTimeout(r, 600));
        setAddress(MOCK_ADDRESS);
        setChainId(MOCK_CHAIN_ID);
        setStatus('connected');
        localStorage.setItem(
          'octra-wallet',
          JSON.stringify({ address: MOCK_ADDRESS, chainId: MOCK_CHAIN_ID })
        );
        return;
      }

      // Production: request wallet connection via injected provider
      const provider = (window as Record<string, unknown>).octraWallet as
        | { request: (args: { method: string }) => Promise<unknown> }
        | undefined;

      if (!provider) {
        throw new Error('No OctraShield wallet detected. Please install the extension.');
      }

      const accounts = (await provider.request({
        method: 'octra_requestAccounts',
      })) as string[];

      if (!accounts.length) {
        throw new Error('No accounts returned. Please unlock your wallet.');
      }

      const cid = (await provider.request({
        method: 'octra_chainId',
      })) as number;

      setAddress(accounts[0] as Address);
      setChainId(cid);
      setStatus('connected');
      localStorage.setItem(
        'octra-wallet',
        JSON.stringify({ address: accounts[0], chainId: cid })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      setStatus('error');
    }
  }, [useMock]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setKeyPair(null);
    setChainId(null);
    setStatus('disconnected');
    setError(null);
    localStorage.removeItem('octra-wallet');
  }, []);

  const deriveKeys = useCallback(async () => {
    if (!address) {
      setError('Connect wallet before deriving keys');
      return;
    }

    try {
      if (useMock) {
        await new Promise((r) => setTimeout(r, 400));
        setKeyPair(deriveMockKeys(address));
        return;
      }

      // Production: sign a fixed message to derive HFHE keys deterministically
      const provider = (window as Record<string, unknown>).octraWallet as
        | { request: (args: { method: string; params: unknown[] }) => Promise<unknown> }
        | undefined;

      if (!provider) throw new Error('Wallet not available');

      const message = `OctraShield HFHE Key Derivation\nAddress: ${address}\nVersion: 1`;
      const signature = (await provider.request({
        method: 'octra_signMessage',
        params: [message],
      })) as Uint8Array;

      // Derive keys from signature (simplified — production uses HKDF)
      const pk = signature.slice(0, 32);
      const sk = signature.slice(32, 64);
      setKeyPair({
        publicKey: pk,
        secretKey: sk,
        fingerprint: address.slice(2, 10).toUpperCase(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Key derivation failed';
      setError(msg);
    }
  }, [address, useMock]);

  // Auto-derive keys after connection
  useEffect(() => {
    if (status === 'connected' && address && !keyPair) {
      deriveKeys();
    }
  }, [status, address, keyPair, deriveKeys]);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      address,
      keyPair,
      chainId,
      displayAddress: address ? truncateAddress(address) : null,
      connect,
      disconnect,
      deriveKeys,
      hasKeys: keyPair !== null,
      error,
    }),
    [status, address, keyPair, chainId, connect, disconnect, deriveKeys, error]
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}

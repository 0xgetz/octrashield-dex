/**
 * useOctraShield — Root Provider Hook
 *
 * Initializes the SDK, manages wallet connection, HFHE key pair,
 * and provides the core context for all other hooks.
 *
 * Usage:
 * ```tsx
 * function App() {
 *   const { connect, disconnect, isConnected, address } = useOctraShield({
 *     network: 'octra-testnet',
 *   });
 *
 *   return (
 *     <button onClick={connect}>
 *       {isConnected ? truncateAddress(address!) : 'Connect Wallet'}
 *     </button>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  OctraShieldConfig,
  Address,
  HfheKeyPair,
  WalletState,
  ConnectionStatus,
} from '../core/types.js';
import { TransactionBuilder } from '../core/ocs01.js';
import { generateKeyPair } from '../core/hfhe.js';
import { NETWORKS, DEFAULT_NETWORK } from '../core/constants.js';
import { ConnectionError, WalletNotConnected } from '../core/errors.js';
import { FactoryClient } from '../clients/factory.js';
import { RouterClient } from '../clients/router.js';
import { AIEngineClient } from '../clients/ai-engine.js';

// ============================================================================
// Types
// ============================================================================

export interface OctraShieldContext {
  /** Current connection status */
  readonly status: ConnectionStatus;
  /** Whether the wallet is connected and SDK is ready */
  readonly isConnected: boolean;
  /** Connected wallet address */
  readonly address: Address | null;
  /** Chain ID of the connected network */
  // TODO: Octra Network does not use numeric chain IDs (not EVM-compatible).
  // chainId is string "v3.0.0-irmin" from node_status, not a number.
  readonly chainId: string | null;
  /** HFHE key pair for encryption/decryption */
  readonly keyPair: HfheKeyPair | null;
  /** Transaction builder for contract interactions */
  readonly txBuilder: TransactionBuilder | null;
  /** Pre-configured contract clients */
  readonly clients: {
    readonly factory: FactoryClient | null;
    readonly router: RouterClient | null;
    readonly aiEngine: AIEngineClient | null;
  };
  /** Connect wallet and initialize SDK */
  readonly connect: (signingKey?: Uint8Array) => Promise<void>;
  /** Disconnect wallet and clean up */
  readonly disconnect: () => void;
  /** Generate a new HFHE key pair */
  readonly regenerateKeys: () => HfheKeyPair;
  /** Connection error, if any */
  readonly error: Error | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Root SDK hook. Initializes connection, HFHE keys, and contract clients.
 *
 * @param config - SDK configuration
 * @returns OctraShield context with connection state and clients
 */
export function useOctraShield(
  config: Partial<OctraShieldConfig> = {}
): OctraShieldContext {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [address, setAddress] = useState<Address | null>(null);
  // TODO: Octra chainId is a string version ("v3.0.0-irmin"), not a number
  const [chainId, setChainId] = useState<string | null>(null);
  const [keyPair, setKeyPair] = useState<HfheKeyPair | null>(config.hfheKeyPair || null);
  const [error, setError] = useState<Error | null>(null);

  const txBuilderRef = useRef<TransactionBuilder | null>(null);

  // Resolve network config
  const networkConfig = useMemo(() => {
    const networkId = config.network || DEFAULT_NETWORK;
    return NETWORKS[networkId] || NETWORKS[DEFAULT_NETWORK];
  }, [config.network]);

  // Contract addresses
  const contractAddresses = useMemo(() => ({
    factory: config.contracts?.factory || networkConfig.contracts.factory as Address,
    router: config.contracts?.router || networkConfig.contracts.router as Address,
    aiEngine: config.contracts?.aiEngine || networkConfig.contracts.aiEngine as Address,
  }), [config.contracts, networkConfig]);

  /**
   * Generate or regenerate HFHE key pair.
   */
  const regenerateKeys = useCallback((): HfheKeyPair => {
    const newKeyPair = generateKeyPair();
    setKeyPair(newKeyPair);
    return newKeyPair;
  }, []);

  /**
   * Connect wallet and initialize the SDK.
   */
  const connect = useCallback(async (signingKey?: Uint8Array) => {
    try {
      setStatus('connecting');
      setError(null);

      // Ensure we have an HFHE key pair
      let activeKeyPair = keyPair;
      if (!activeKeyPair) {
        activeKeyPair = generateKeyPair();
        setKeyPair(activeKeyPair);
      }

      // Use provided signing key or generate from config
      const sk = signingKey || config.signingKey;
      if (!sk) {
        throw new ConnectionError('No signing key provided. Pass a 32-byte Ed25519 private key.');
      }

      // Create transaction builder
      const fullConfig: OctraShieldConfig = {
        network: config.network || DEFAULT_NETWORK,
        rpcUrl: config.rpcUrl || networkConfig.rpcUrl,
        contracts: contractAddresses as any,
        hfheKeyPair: activeKeyPair,
        signingKey: sk,
        debug: config.debug,
      };

      const builder = new TransactionBuilder(fullConfig, sk);
      await builder.initialize();

      txBuilderRef.current = builder;
      setAddress(builder.getSignerAddress());
      setChainId(networkConfig.chainId as string); // Octra: string, not numeric
      setStatus('connected');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setStatus('error');
      throw error;
    }
  }, [keyPair, config, networkConfig, contractAddresses]);

  /**
   * Disconnect and clean up.
   */
  const disconnect = useCallback(() => {
    txBuilderRef.current = null;
    setAddress(null);
    setChainId(null);
    setStatus('disconnected');
    setError(null);
  }, []);

  // Build contract clients when connected
  const clients = useMemo(() => {
    const builder = txBuilderRef.current;
    if (!builder || !keyPair) {
      return { factory: null, router: null, aiEngine: null };
    }

    return {
      factory: new FactoryClient(builder, contractAddresses.factory),
      router: new RouterClient(builder, keyPair, contractAddresses.router),
      aiEngine: new AIEngineClient(builder, keyPair, contractAddresses.aiEngine),
    };
  }, [status, keyPair, contractAddresses]); // Re-create when status changes

  return {
    status,
    isConnected: status === 'connected',
    address,
    chainId,
    keyPair,
    txBuilder: txBuilderRef.current,
    clients,
    connect,
    disconnect,
    regenerateKeys,
    error,
  };
}

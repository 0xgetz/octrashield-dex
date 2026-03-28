/**
 * OCS01 Transaction Builder & Ed25519 Signing
 *
 * Builds, signs, and submits OCS01-compliant transactions to Octra Network.
 * Handles the view/call distinction, nonce management, deadline enforcement,
 * and Ed25519 signature generation.
 *
 * Transaction lifecycle:
 *   1. Build: Construct the method call with typed arguments
 *   2. Encode: Serialize to OCS01 wire format
 *   3. Sign:   Ed25519 signature over the encoded payload
 *   4. Submit: Send to Octra Network RPC
 *   5. Wait:   Poll for receipt with event parsing
 */

import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { OCS01_VIEW_PREFIX, OCS01_CALL_PREFIX, DEFAULT_DEADLINE_SECONDS } from './constants.js';
import type {
  Address,
  TxHash,
  OCS01ViewCall,
  OCS01CallTransaction,
  TransactionReceipt,
  ContractEvent,
  OctraShieldConfig,
} from './types.js';
import {
  TransactionError,
  SignatureError,
  DeadlineExpired,
  NonceError,
  RpcError,
  ConnectionError,
} from './errors.js';
import { bytesToHex } from './hfhe.js';

// Configure ed25519 to use @noble/hashes
ed25519.etc.sha512Sync = (...msgs: Uint8Array[]) => {
  const combined = new Uint8Array(msgs.reduce((sum, m) => sum + m.length, 0));
  let offset = 0;
  for (const m of msgs) {
    combined.set(m, offset);
    offset += m.length;
  }
  return sha512(combined);
};

// ============================================================================
// OCS01 Wire Format Encoding
// ============================================================================

/**
 * Text encoder for string -> bytes conversion.
 */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encode a value into OCS01 wire format bytes.
 * Supports: bigint, number, string, boolean, Uint8Array, Address, arrays.
 */
function encodeValue(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    // Raw bytes: [length(4)] [data]
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, value.length, true);
    return concat(header, value);
  }

  if (typeof value === 'bigint') {
    // BigInt: [type(1)=0x01] [value(8)] little-endian
    const buf = new Uint8Array(9);
    buf[0] = 0x01;
    new DataView(buf.buffer, 1, 8).setBigUint64(0, value, true);
    return buf;
  }

  if (typeof value === 'number') {
    // Number: convert to bigint encoding
    return encodeValue(BigInt(value));
  }

  if (typeof value === 'string') {
    // String: [type(1)=0x02] [length(4)] [utf8_bytes]
    const strBytes = textEncoder.encode(value);
    const buf = new Uint8Array(5 + strBytes.length);
    buf[0] = 0x02;
    new DataView(buf.buffer, 1, 4).setUint32(0, strBytes.length, true);
    buf.set(strBytes, 5);
    return buf;
  }

  if (typeof value === 'boolean') {
    // Boolean: [type(1)=0x03] [value(1)]
    return new Uint8Array([0x03, value ? 1 : 0]);
  }

  if (Array.isArray(value)) {
    // Array: [type(1)=0x04] [count(4)] [encoded_elements...]
    const encoded = value.map(v => encodeValue(v));
    const totalLen = encoded.reduce((sum, e) => sum + e.length, 0);
    const buf = new Uint8Array(5 + totalLen);
    buf[0] = 0x04;
    new DataView(buf.buffer, 1, 4).setUint32(0, value.length, true);
    let offset = 5;
    for (const e of encoded) {
      buf.set(e, offset);
      offset += e.length;
    }
    return buf;
  }

  // Object: serialize as JSON string
  if (typeof value === 'object' && value !== null) {
    return encodeValue(JSON.stringify(value));
  }

  throw new TransactionError(`Cannot encode value of type ${typeof value}`);
}

/**
 * Encode a complete OCS01 view call into wire format.
 *
 * Format: [VIEW_PREFIX(1)] [contract(32)] [method_len(4)] [method] [arg_count(4)] [args...]
 */
export function encodeViewCall(call: OCS01ViewCall): Uint8Array {
  const methodBytes = textEncoder.encode(call.method);
  const encodedArgs = call.args.map(a => encodeValue(a));
  const argsLen = encodedArgs.reduce((sum, a) => sum + a.length, 0);

  const buf = new Uint8Array(
    1 +              // prefix
    32 +             // contract address
    4 +              // method name length
    methodBytes.length +
    4 +              // arg count
    argsLen
  );

  let offset = 0;

  // View prefix
  buf.set(OCS01_VIEW_PREFIX, offset); offset += 1;

  // Contract address (32 bytes, hex-decoded)
  buf.set(hexToBytes(call.contract as string), offset); offset += 32;

  // Method name
  new DataView(buf.buffer, offset, 4).setUint32(0, methodBytes.length, true);
  offset += 4;
  buf.set(methodBytes, offset); offset += methodBytes.length;

  // Arguments
  new DataView(buf.buffer, offset, 4).setUint32(0, call.args.length, true);
  offset += 4;
  for (const arg of encodedArgs) {
    buf.set(arg, offset);
    offset += arg.length;
  }

  return buf;
}

/**
 * Encode a complete OCS01 call transaction into wire format (unsigned).
 *
 * Format: [CALL_PREFIX(1)] [contract(32)] [signer(32)] [nonce(8)]
 *         [deadline(8)] [method_len(4)] [method] [arg_count(4)] [args...]
 */
export function encodeCallTransaction(tx: Omit<OCS01CallTransaction, 'signature' | 'type'>): Uint8Array {
  const methodBytes = textEncoder.encode(tx.method);
  const encodedArgs = tx.args.map(a => encodeValue(a));
  const argsLen = encodedArgs.reduce((sum, a) => sum + a.length, 0);

  const buf = new Uint8Array(
    1 +              // prefix
    32 +             // contract address
    32 +             // signer address
    8 +              // nonce
    8 +              // deadline
    4 +              // method name length
    methodBytes.length +
    4 +              // arg count
    argsLen
  );

  let offset = 0;

  // Call prefix
  buf.set(OCS01_CALL_PREFIX, offset); offset += 1;

  // Contract address
  buf.set(hexToBytes(tx.contract as string), offset); offset += 32;

  // Signer address
  buf.set(hexToBytes(tx.signer as string), offset); offset += 32;

  // Nonce
  new DataView(buf.buffer, offset, 8).setBigUint64(0, tx.nonce, true);
  offset += 8;

  // Deadline
  new DataView(buf.buffer, offset, 8).setBigUint64(0, tx.deadline, true);
  offset += 8;

  // Method name
  new DataView(buf.buffer, offset, 4).setUint32(0, methodBytes.length, true);
  offset += 4;
  buf.set(methodBytes, offset); offset += methodBytes.length;

  // Arguments
  new DataView(buf.buffer, offset, 4).setUint32(0, tx.args.length, true);
  offset += 4;
  for (const arg of encodedArgs) {
    buf.set(arg, offset);
    offset += arg.length;
  }

  return buf;
}

// ============================================================================
// Ed25519 Signing
// ============================================================================

/**
 * Sign an OCS01 call transaction payload with Ed25519.
 *
 * @param payload - The encoded (unsigned) transaction bytes
 * @param signingKey - 32-byte Ed25519 private key
 * @returns 64-byte Ed25519 signature
 */
export async function signPayload(payload: Uint8Array, signingKey: Uint8Array): Promise<Uint8Array> {
  if (signingKey.length !== 32) {
    throw new SignatureError(`Signing key must be 32 bytes, got ${signingKey.length}`);
  }

  try {
    const signature = await ed25519.signAsync(payload, signingKey);
    return new Uint8Array(signature);
  } catch (err) {
    throw new SignatureError(`Ed25519 signing failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Verify an Ed25519 signature over a payload.
 *
 * @param signature - 64-byte Ed25519 signature
 * @param payload - The signed payload bytes
 * @param publicKey - 32-byte Ed25519 public key
 * @returns true if signature is valid
 */
export async function verifySignature(
  signature: Uint8Array,
  payload: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  try {
    return await ed25519.verifyAsync(signature, payload, publicKey);
  } catch {
    return false;
  }
}

/**
 * Derive the Ed25519 public key from a private key.
 */
export async function derivePublicKey(signingKey: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await ed25519.getPublicKeyAsync(signingKey));
}

// ============================================================================
// Transaction Builder
// ============================================================================

/**
 * High-level transaction builder for OCS01 contracts.
 * Manages nonce tracking, deadline calculation, signing, and submission.
 */
export class TransactionBuilder {
  private nonce: bigint = 0n;
  private readonly rpcUrl: string;
  private readonly signingKey: Uint8Array | null;
  private signerAddress: Address | null = null;

  constructor(config: OctraShieldConfig, signingKey?: Uint8Array) {
    const network = config.network;
    this.rpcUrl = config.rpcUrl || `https://rpc.octra.network`;
    this.signingKey = signingKey || config.signingKey || null;
  }

  /**
   * Initialize the builder: derive signer address and fetch current nonce.
   */
  async initialize(): Promise<void> {
    if (this.signingKey) {
      const pubKey = await derivePublicKey(this.signingKey);
      this.signerAddress = bytesToHex(pubKey) as Address;
      this.nonce = await this.fetchNonce(this.signerAddress);
    }
  }

  /**
   * Get the signer's address.
   */
  getSignerAddress(): Address {
    if (!this.signerAddress) {
      throw new SignatureError('TransactionBuilder not initialized. Call initialize() first.');
    }
    return this.signerAddress;
  }

  // --------------------------------------------------------------------------
  // View Calls (no signing required)
  // --------------------------------------------------------------------------

  /**
   * Execute a view call (read-only, no signature needed).
   */
  async viewCall<T>(
    contract: Address,
    method: string,
    args: unknown[] = []
  ): Promise<T> {
    const call: OCS01ViewCall = { type: 'view', contract, method, args };
    const encoded = encodeViewCall(call);

    const response = await this.rpcSend('ocs01_viewCall', [
      bytesToHex(encoded),
    ]);

    return response as unknown as T;
  }

  // --------------------------------------------------------------------------
  // Call Transactions (signed, state-mutating)
  // --------------------------------------------------------------------------

  /**
   * Build, sign, and submit a call transaction.
   *
   * @param contract - Target contract address
   * @param method - Method name (e.g., 'call_swap_exact_input')
   * @param args - Method arguments
   * @param deadlineSeconds - Seconds until deadline (default: 1200)
   * @returns Transaction receipt after on-chain execution
   */
  async callTransaction(
    contract: Address,
    method: string,
    args: unknown[] = [],
    deadlineSeconds: number = DEFAULT_DEADLINE_SECONDS
  ): Promise<TransactionReceipt> {
    if (!this.signingKey || !this.signerAddress) {
      throw new SignatureError('No signing key configured. Cannot send call transactions.');
    }

    // Calculate deadline block
    const currentBlock = await this.fetchCurrentBlock();
    const deadlineBlock = currentBlock + BigInt(Math.ceil(deadlineSeconds / 2)); // ~2s block time

    // Build unsigned payload
    const txData = {
      contract,
      method,
      args,
      signer: this.signerAddress,
      nonce: this.nonce,
      deadline: deadlineBlock,
    };
    const encoded = encodeCallTransaction(txData);

    // Sign with Ed25519
    const signature = await signPayload(encoded, this.signingKey);

    // Submit signed transaction
    const txHash = await this.rpcSend<string>('ocs01_sendTransaction', [
      bytesToHex(encoded),
      bytesToHex(signature),
    ]);

    // Increment nonce for next transaction
    this.nonce += 1n;

    // Wait for receipt
    return this.waitForReceipt(txHash as TxHash);
  }

  /**
   * Estimate gas for a call transaction without executing it.
   */
  async estimateGas(
    contract: Address,
    method: string,
    args: unknown[] = []
  ): Promise<bigint> {
    const txData = {
      contract,
      method,
      args,
      signer: this.signerAddress || ('0'.repeat(64) as Address),
      nonce: this.nonce,
      deadline: BigInt(Number.MAX_SAFE_INTEGER),
    };
    const encoded = encodeCallTransaction(txData);

    const result = await this.rpcSend<string>('ocs01_estimateGas', [
      bytesToHex(encoded),
    ]);

    return BigInt(result);
  }

  // --------------------------------------------------------------------------
  // Receipt Polling
  // --------------------------------------------------------------------------

  /**
   * Wait for a transaction to be included in a block.
   * Polls every 2 seconds, times out after 120 seconds.
   */
  async waitForReceipt(txHash: TxHash, timeoutMs: number = 120_000): Promise<TransactionReceipt> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const receipt = await this.rpcSend<TransactionReceipt | null>(
          'ocs01_getTransactionReceipt',
          [txHash]
        );

        if (receipt) {
          return {
            txHash,
            blockNumber: BigInt(receipt.blockNumber),
            blockTimestamp: BigInt(receipt.blockTimestamp),
            gasUsed: BigInt(receipt.gasUsed),
            status: receipt.status,
            events: (receipt.events || []).map((e: any) => parseEvent(e as any)),
            revertReason: receipt.revertReason,
          };
        }
      } catch {
        // Receipt not yet available, continue polling
      }

      await sleep(pollInterval);
    }

    throw new TransactionError(
      `Transaction ${txHash} not confirmed after ${timeoutMs / 1000}s`,
      { txHash }
    );
  }

  // --------------------------------------------------------------------------
  // RPC Communication
  // --------------------------------------------------------------------------

  /**
   * Send a JSON-RPC request to the Octra Network.
   */
  private async rpcSend<T>(method: string, params: unknown[]): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
      });
    } catch (err) {
      throw new ConnectionError(
        `Failed to connect to ${this.rpcUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      throw new RpcError(method, response.status, response.statusText);
    }

    const json = await response.json() as {
      result?: T;
      error?: { code: number; message: string };
    };

    if (json.error) {
      throw new RpcError(method, json.error.code, json.error.message);
    }

    return json.result as T;
  }

  /**
   * Fetch the current nonce for an address.
   */
  private async fetchNonce(address: Address): Promise<bigint> {
    const result = await this.rpcSend<string>('ocs01_getNonce', [address]);
    return BigInt(result);
  }

  /**
   * Fetch the current block number.
   */
  private async fetchCurrentBlock(): Promise<bigint> {
    const result = await this.rpcSend<string>('ocs01_blockNumber', []);
    return BigInt(result);
  }
}

// ============================================================================
// Event Parsing
// ============================================================================

/**
 * Parse a raw contract event from RPC into a typed ContractEvent.
 */
function parseEvent(raw: Record<string, unknown>): ContractEvent {
  return {
    contract: (raw.contract || raw.address) as Address,
    name: raw.name as string || raw.event as string || 'Unknown',
    data: (raw.data || raw.args || {}) as Record<string, unknown>,
    blockNumber: BigInt(raw.blockNumber as string || '0'),
    txHash: raw.txHash as TxHash || raw.transactionHash as TxHash,
    logIndex: Number(raw.logIndex || 0),
  };
}

// ============================================================================
// Utilities
// ============================================================================

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

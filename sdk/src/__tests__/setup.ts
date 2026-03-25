/**
 * Vitest setup — polyfills and global mocks for SDK tests.
 */

import { vi } from 'vitest';

// Polyfill crypto.getRandomValues for HFHE key generation in Node
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

// Mock TextEncoder/TextDecoder if not present
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('node:util');
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder });
}

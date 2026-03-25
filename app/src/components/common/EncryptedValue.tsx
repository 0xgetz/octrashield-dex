/**
 * EncryptedValue — Displays encrypted values with reveal animation.
 *
 * Shows a blurred/shimmer placeholder when encrypted, then animates
 * to the decrypted plaintext. Includes a lock icon toggle for
 * manual reveal/hide of sensitive values.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

export interface EncryptedValueProps {
  /** Decrypted plaintext value (null = still encrypted/loading) */
  value: string | null;
  /** Formatted display value (e.g., "1,234.56 OCTA") */
  displayValue?: string;
  /** Loading state (decryption in progress) */
  loading?: boolean;
  /** Allow user to toggle visibility */
  revealable?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Font mono */
  mono?: boolean;
  /** Additional class */
  className?: string;
}

const sizeStyles = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl font-semibold',
};

export function EncryptedValue({
  value,
  displayValue,
  loading = false,
  revealable = false,
  size = 'md',
  mono = true,
  className,
}: EncryptedValueProps) {
  const [revealed, setRevealed] = useState(!revealable);
  const display = displayValue ?? value;
  const isDecrypted = value !== null && !loading;

  // Loading / decrypting state
  if (loading) {
    return (
      <div className={clsx('inline-flex items-center gap-2', className)}>
        <div className={clsx('shimmer', size === 'lg' ? 'w-28 h-7' : size === 'sm' ? 'w-16 h-4' : 'w-20 h-5')} />
        <LockIcon locked className="w-3.5 h-3.5 text-shield-400 animate-pulse-glow" />
      </div>
    );
  }

  // Not yet decrypted
  if (!isDecrypted) {
    return (
      <div className={clsx('inline-flex items-center gap-2', sizeStyles[size], className)}>
        <span className="text-surface-500 select-none" style={{ filter: 'blur(4px)' }}>
          ****.**
        </span>
        <LockIcon locked className="w-3.5 h-3.5 text-shield-400" />
      </div>
    );
  }

  // Decrypted — show with optional reveal toggle
  return (
    <div className={clsx('inline-flex items-center gap-2', sizeStyles[size], className)}>
      <AnimatePresence mode="wait">
        <motion.span
          key={revealed ? 'revealed' : 'hidden'}
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: revealed ? 'blur(0px)' : 'blur(6px)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className={clsx(
            'text-surface-50',
            mono && 'font-mono tracking-tight',
            !revealed && 'select-none'
          )}
        >
          {revealed ? display : '****.**'}
        </motion.span>
      </AnimatePresence>

      {revealable && (
        <button
          onClick={() => setRevealed((r) => !r)}
          className="p-0.5 rounded text-surface-400 hover:text-shield-400 transition-colors"
          title={revealed ? 'Hide value' : 'Reveal value'}
        >
          <LockIcon locked={!revealed} className="w-3.5 h-3.5" />
        </button>
      )}

      {!revealable && isDecrypted && (
        <LockIcon locked={false} className="w-3 h-3 text-emerald-500/60" />
      )}
    </div>
  );
}

// ============================================================================
// Lock Icon
// ============================================================================

function LockIcon({ locked, className }: { locked: boolean; className?: string }) {
  if (locked) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

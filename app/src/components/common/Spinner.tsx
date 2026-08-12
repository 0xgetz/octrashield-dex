/**
 * Spinner — Animated loading indicator.
 */

import { clsx } from 'clsx';

export interface SpinnerProps {
  size?: number | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 14, md: 20, lg: 28 } as const;

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const pixels = typeof size === 'number' ? size : sizeMap[size];
  return (
    <svg
      className={clsx('animate-spin text-current', className)}
      width={pixels}
      height={pixels}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
      role="status"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

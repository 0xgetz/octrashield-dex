/**
 * StatusBadge — Color-coded status indicator with optional pulse.
 */

import { clsx } from 'clsx';
import { type ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'shield';

export interface StatusBadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  /** Show pulsing dot indicator */
  pulse?: boolean;
  /** Size */
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger:  'bg-red-500/10 text-red-400 border-red-500/20',
  info:    'bg-octra-500/10 text-octra-400 border-octra-500/20',
  neutral: 'bg-surface-700/60 text-surface-300 border-surface-500/20',
  shield:  'bg-shield-500/10 text-shield-400 border-shield-500/20',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger:  'bg-red-400',
  info:    'bg-octra-400',
  neutral: 'bg-surface-400',
  shield:  'bg-shield-400',
};

export function StatusBadge({
  variant = 'neutral',
  children,
  pulse = false,
  size = 'sm',
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 border rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
        variantStyles[variant],
        className
      )}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={clsx(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              dotColors[variant]
            )}
          />
          <span
            className={clsx(
              'relative inline-flex h-1.5 w-1.5 rounded-full',
              dotColors[variant]
            )}
          />
        </span>
      )}
      {children}
    </span>
  );
}

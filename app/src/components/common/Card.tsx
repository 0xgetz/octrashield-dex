/**
 * Card — Glass-morphism container with optional header, glow, and hover.
 */

import { type ReactNode } from 'react';
import { clsx } from 'clsx';

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Show gradient glow on top edge */
  glow?: boolean;
  /** Interactive hover effect */
  hover?: boolean;
  /** Compact padding */
  compact?: boolean;
  /** Optional header */
  header?: ReactNode;
  /** Optional footer */
  footer?: ReactNode;
  onClick?: () => void;
}

export function Card({
  children,
  className,
  glow = false,
  hover = false,
  compact = false,
  header,
  footer,
  onClick,
}: CardProps) {
  return (
    <div
      className={clsx(
        'relative rounded-2xl border border-surface-500/20 overflow-hidden',
        'bg-surface-800/60 backdrop-blur-md shadow-inner-glow',
        hover && 'transition-all duration-200 cursor-pointer hover:bg-surface-700/60 hover:border-surface-500/30 hover:shadow-glow-sm',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {/* Top glow accent */}
      {glow && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-octra-500/50 to-transparent" />
      )}

      {/* Header */}
      {header && (
        <div className={clsx(
          'border-b border-surface-500/20',
          compact ? 'px-4 py-2.5' : 'px-5 py-3.5'
        )}>
          {header}
        </div>
      )}

      {/* Content */}
      <div className={compact ? 'p-4' : 'p-5'}>
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className={clsx(
          'border-t border-surface-500/20',
          compact ? 'px-4 py-2.5' : 'px-5 py-3.5'
        )}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** Stat card variant — displays a label and value */
export function StatCard({
  label,
  value,
  subValue,
  icon,
  trend,
  className,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon?: ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}) {
  return (
    <Card compact className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label mb-1">{label}</p>
          <p className="stat-value">{value}</p>
          {subValue && (
            <p className="text-xs text-surface-300 mt-0.5">{subValue}</p>
          )}
          {trend && (
            <p className={clsx(
              'text-xs font-medium mt-1',
              trend.positive ? 'text-emerald-400' : 'text-red-400'
            )}>
              {trend.positive ? '+' : ''}{trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-surface-700/60 flex items-center justify-center text-surface-300">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

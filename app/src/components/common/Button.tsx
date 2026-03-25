/**
 * Button — Primary interactive element with variants.
 *
 * Variants: primary (gradient), secondary (outline), ghost, danger
 * Sizes: sm, md, lg
 * States: loading (spinner), disabled
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Spinner } from './Spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-r from-octra-600 to-shield-600
    hover:from-octra-500 hover:to-shield-500
    text-white font-semibold shadow-glow-sm hover:shadow-glow
    active:from-octra-700 active:to-shield-700
    btn-glow
  `,
  secondary: `
    bg-surface-800/60 border border-surface-500/30
    hover:bg-surface-700/60 hover:border-surface-500/50
    text-surface-100 font-medium
    active:bg-surface-800
  `,
  ghost: `
    bg-transparent hover:bg-surface-700/40
    text-surface-200 hover:text-surface-50
    font-medium
  `,
  danger: `
    bg-red-500/10 border border-red-500/30
    hover:bg-red-500/20 hover:border-red-500/50
    text-red-400 font-medium
    active:bg-red-500/30
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3.5 text-base rounded-xl gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={clsx(
          'inline-flex items-center justify-center transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-octra-500/50',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {loading ? (
          <Spinner size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
        ) : icon ? (
          <span className="shrink-0 w-4 h-4">{icon}</span>
        ) : null}
        {children && <span>{children}</span>}
        {iconRight && <span className="shrink-0 w-4 h-4">{iconRight}</span>}
      </button>
    );
  }
);

/**
 * Theme Configuration — Color tokens, animation presets, and spacing.
 * Mirrors Tailwind config but as runtime JS for Framer Motion and dynamic styles.
 */

export const colors = {
  octra: {
    primary: '#28a3ff',
    secondary: '#0a6beb',
    light: '#89d9ff',
    dark: '#0f2d5a',
  },
  shield: {
    primary: '#843dff',
    secondary: '#6a0aed',
    light: '#bea6ff',
    dark: '#2c036f',
  },
  surface: {
    bg: '#0a0e1a',
    card: '#0f1425',
    elevated: '#161c30',
    hover: '#1e253d',
    border: '#2a3352',
    muted: '#3d4a6a',
    secondary: '#5a6a8a',
    placeholder: '#8a97b5',
    text: '#c0c9de',
    bright: '#e8ecf4',
  },
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
} as const;

/** Framer Motion transition presets */
export const transitions = {
  fast:    { duration: 0.15, ease: 'easeOut' },
  normal:  { duration: 0.3,  ease: 'easeOut' },
  slow:    { duration: 0.5,  ease: 'easeInOut' },
  spring:  { type: 'spring', stiffness: 300, damping: 24 },
  bounce:  { type: 'spring', stiffness: 400, damping: 17 },
} as const;

/** Framer Motion animation variants */
export const variants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit:    { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: -8 },
  },
  slideDown: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: 8 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit:    { opacity: 0, scale: 0.95 },
  },
  stagger: {
    animate: { transition: { staggerChildren: 0.05 } },
  },
} as const;

/** Gradient presets for backgrounds and borders */
export const gradients = {
  brand: 'linear-gradient(135deg, #28a3ff, #843dff)',
  brandHover: 'linear-gradient(135deg, #50c2ff, #9f75ff)',
  surface: 'linear-gradient(135deg, #0f1425, #161c30)',
  glow: 'radial-gradient(circle at 50% 0%, rgba(40, 163, 255, 0.12), transparent 60%)',
  glowViolet: 'radial-gradient(circle at 50% 0%, rgba(132, 61, 255, 0.12), transparent 60%)',
  mesh: `
    radial-gradient(at 20% 30%, rgba(10, 107, 235, 0.08) 0, transparent 50%),
    radial-gradient(at 80% 70%, rgba(106, 10, 237, 0.06) 0, transparent 50%)
  `,
} as const;

/** Z-index scale */
export const zIndex = {
  dropdown: 50,
  sticky: 100,
  modal: 200,
  popover: 300,
  tooltip: 400,
  toast: 500,
} as const;

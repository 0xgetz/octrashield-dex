import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OctraShield brand palette — deep navy + electric cyan + violet accents
        octra: {
          50:  '#eef9ff',
          100: '#d8f1ff',
          200: '#b9e7ff',
          300: '#89d9ff',
          400: '#50c2ff',
          500: '#28a3ff',
          600: '#0d83ff',
          700: '#0a6beb',
          800: '#1056be',
          900: '#144a95',
          950: '#0f2d5a',
        },
        shield: {
          50:  '#f3f1ff',
          100: '#ebe5ff',
          200: '#d9ceff',
          300: '#bea6ff',
          400: '#9f75ff',
          500: '#843dff',
          600: '#7716ff',
          700: '#6a0aed',
          800: '#580bc7',
          900: '#490da3',
          950: '#2c036f',
        },
        surface: {
          900: '#0a0e1a',  // deepest background
          800: '#0f1425',  // card background
          700: '#161c30',  // elevated surface
          600: '#1e253d',  // hover state
          500: '#2a3352',  // borders
          400: '#3d4a6a',  // muted text
          300: '#5a6a8a',  // secondary text
          200: '#8a97b5',  // placeholder
          100: '#c0c9de',  // primary text
          50:  '#e8ecf4',  // bright text
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger:  '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'glow-sm': '0 0 8px rgba(40, 163, 255, 0.15)',
        'glow':    '0 0 20px rgba(40, 163, 255, 0.2)',
        'glow-lg': '0 0 40px rgba(40, 163, 255, 0.25)',
        'glow-violet': '0 0 20px rgba(132, 61, 255, 0.2)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'conic-gradient(from 0deg at 50% 50%, #0a6beb 0%, #843dff 25%, #0a6beb 50%, #843dff 75%, #0a6beb 100%)',
        'glass-border': 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'pulse-glow': 'pulse-glow 2s infinite ease-in-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config;

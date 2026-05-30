import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-subtle': 'var(--bg-subtle)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        accent: 'var(--accent)',
        'accent-strong': 'var(--accent-strong)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        destructive: 'var(--destructive)',
        positive: 'var(--positive)',
        // shadcn aliases preserved
        background: 'var(--bg)',
        foreground: 'var(--fg)',
        primary: { DEFAULT: 'var(--accent)', foreground: '#FFFFFF' },
        muted: { DEFAULT: 'var(--bg-subtle)', foreground: 'var(--fg-muted)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        prose: ['Newsreader', 'Source Serif Pro', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        heading: ['Inter', 'system-ui', 'sans-serif'], // alias kept for legacy uses
      },
      fontSize: {
        'display-xl': ['64px', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-lg': ['48px', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-md': ['36px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-sm': ['28px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '800' }],
        'heading-lg': ['22px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'heading-md': ['18px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '700' }],
        body: ['14px', { lineHeight: '1.5' }],
        'body-sm': ['13px', { lineHeight: '1.5' }],
        label: ['11px', { lineHeight: '1', letterSpacing: '0.18em', fontWeight: '600' }],
        prose: ['18px', { lineHeight: '1.75' }],
      },
      boxShadow: {
        'glow-pink': 'var(--glow-pink)',
        'glow-pink-soft': 'var(--glow-pink-soft)',
        elev: 'var(--shadow-elev)',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        DEFAULT: '200ms',
        slow: '300ms',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
        'accent-gradient-soft':
          'linear-gradient(90deg, rgba(236,72,153,0.12), rgba(244,114,182,0.04))',
      },
    },
  },
  plugins: [],
};

export default config;

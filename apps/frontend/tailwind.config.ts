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
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground, #FFFFFF)',
        },
        positive: 'var(--positive)',
        // shadcn aliases preserved
        background: 'var(--bg)',
        foreground: 'var(--fg)',
        primary: { DEFAULT: 'var(--accent)', foreground: '#FFFFFF' },
        muted: { DEFAULT: 'var(--bg-subtle)', foreground: 'var(--fg-muted)' },
      },
      // Make the default border color theme-aware. Tailwind Preflight otherwise
      // defaults every element's border-color to gray-200 (#e5e7eb); a
      // `border-<token>/<opacity>` class on a CSS-var color can't be alpha-
      // composited, so it emits no valid color and falls through to that bright
      // gray — which reads as harsh white lines on dark themes. Falling back to
      // var(--border) keeps stray borders subtle and on-theme in both modes.
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        prose: ['Newsreader', 'Source Serif Pro', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
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

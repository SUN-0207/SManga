import { useEffect, type ReactNode } from 'react';
import { useReaderPrefs } from '@/stores/reader-prefs-store';

const FAMILY_CSS: Record<'sans' | 'serif' | 'mono', string> = {
  sans: 'Roboto, ui-sans-serif, system-ui, sans-serif',
  serif: 'Newsreader, ui-serif, Georgia, Cambria, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme, fontSize, fontFamily } = useReaderPrefs();

  useEffect(() => {
    const root = document.documentElement;
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    root.dataset.theme = resolved;
    root.style.setProperty('--reader-font-size', `${fontSize}px`);
    root.style.setProperty('--reader-font-family', FAMILY_CSS[fontFamily]);
  }, [theme, fontSize, fontFamily]);

  // Also listen to system preference changes when theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return <>{children}</>;
}

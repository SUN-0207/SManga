import { useReaderPrefs } from '@/stores/reader-prefs-store';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Header quick-toggle: flips light ↔ dark. The full 3-option control
 * (Sáng / Tối / Hệ thống) stays in the reader-settings drawer; this shortcut
 * always lands on an explicit theme. Reuses useReaderPrefs, so ThemeProvider's
 * data-theme effect performs the actual switch.
 */
export function ThemeToggle() {
  const theme = useReaderPrefs((s) => s.theme);
  const setTheme = useReaderPrefs((s) => s.setTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-pressed={isDark}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
      className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

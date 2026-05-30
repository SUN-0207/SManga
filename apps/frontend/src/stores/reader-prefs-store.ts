import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReaderTheme = 'light' | 'dark' | 'system';
export type ReaderFontSize = '15' | '18' | '20' | '24';
export type ReaderFontFamily = 'sans' | 'serif' | 'mono';

interface ReaderPrefs {
  theme: ReaderTheme;
  fontSize: ReaderFontSize;
  fontFamily: ReaderFontFamily;
  setTheme: (t: ReaderTheme) => void;
  setFontSize: (s: ReaderFontSize) => void;
  setFontFamily: (f: ReaderFontFamily) => void;
  // Ephemeral UI state — excluded from localStorage via partialize
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

export const useReaderPrefs = create<ReaderPrefs>()(
  persist(
    (set) => ({
      theme: 'light',
      fontSize: '18',
      fontFamily: 'serif',
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      settingsOpen: false,
      setSettingsOpen: (v) => set({ settingsOpen: v }),
    }),
    {
      name: 'smanga:reader',
      version: 3,
      // Only persist display prefs — settingsOpen is ephemeral UI state
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
      }),
      migrate: (persistedState: unknown, version) => {
        // Pivot 2026-05-30: redesign goes light-first. Previous migrations
        // forced 'system' → 'dark' (v2); reset all pre-v3 stored themes to
        // 'light' so the new default applies on next load. Users can still
        // opt back into dark via Cài đặt drawer.
        if (version < 3 && persistedState && typeof persistedState === 'object') {
          const s = persistedState as { theme?: string };
          s.theme = 'light';
        }
        return persistedState as ReaderPrefs;
      },
    },
  ),
);

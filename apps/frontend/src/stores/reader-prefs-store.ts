import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ReaderPrefs {
  theme: Theme;
  fontSize: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  setTheme: (t: Theme) => void;
  setFontSize: (s: string) => void;
  setFontFamily: (f: 'sans' | 'serif' | 'mono') => void;
}

export const useReaderPrefs = create<ReaderPrefs>()(
  persist(
    (set) => ({
      theme: 'system',
      fontSize: '18',
      fontFamily: 'serif',
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
    }),
    { name: 'smanga:reader' },
  ),
);

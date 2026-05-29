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

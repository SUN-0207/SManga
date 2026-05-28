// Client-only constants for reader UI preferences stored in localStorage.

export const READER_PREF_KEYS = {
  fontSize: 'smanga:reader:font-size',
  fontFamily: 'smanga:reader:font-family',
} as const;

export const FONT_SIZES = [
  { value: '14', label: '14' },
  { value: '16', label: '16' },
  { value: '18', label: '18' },
  { value: '20', label: '20' },
  { value: '22', label: '22' },
  { value: '24', label: '24' },
] as const;

export const FONT_FAMILIES = [
  { value: 'sans', label: 'Sans-serif', css: 'ui-sans-serif, system-ui, sans-serif' },
  { value: 'serif', label: 'Serif', css: 'ui-serif, Georgia, Cambria, serif' },
  { value: 'mono', label: 'Monospace', css: 'ui-monospace, SFMono-Regular, monospace' },
] as const;

export type FontSize = (typeof FONT_SIZES)[number]['value'];
export type FontFamily = (typeof FONT_FAMILIES)[number]['value'];

export const DEFAULT_FONT_SIZE: FontSize = '18';
export const DEFAULT_FONT_FAMILY: FontFamily = 'serif';

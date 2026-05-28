'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  FONT_FAMILIES,
  FONT_SIZES,
  READER_PREF_KEYS,
  type FontFamily,
  type FontSize,
} from '@/lib/reader-preferences';

export function ReaderSettings() {
  const { theme, setTheme } = useTheme();
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE);
  const [fontFamily, setFontFamily] = useState<FontFamily>(DEFAULT_FONT_FAMILY);

  useEffect(() => {
    const size = (window.localStorage.getItem(READER_PREF_KEYS.fontSize) as FontSize | null) ?? DEFAULT_FONT_SIZE;
    const family = (window.localStorage.getItem(READER_PREF_KEYS.fontFamily) as FontFamily | null) ?? DEFAULT_FONT_FAMILY;
    setFontSize(size);
    setFontFamily(family);
    applyToBody(size, family);
  }, []);

  function update(size: FontSize, family: FontFamily) {
    setFontSize(size);
    setFontFamily(family);
    window.localStorage.setItem(READER_PREF_KEYS.fontSize, size);
    window.localStorage.setItem(READER_PREF_KEYS.fontFamily, family);
    applyToBody(size, family);
  }

  function applyToBody(size: FontSize, family: FontFamily) {
    const css = FONT_FAMILIES.find((f) => f.value === family)?.css ?? FONT_FAMILIES[0].css;
    document.documentElement.style.setProperty('--reader-font-size', `${size}px`);
    document.documentElement.style.setProperty('--reader-font-family', css);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
      <div>
        <Label className="mb-2 block">Giao diện</Label>
        <div className="flex gap-2">
          <Button size="sm" variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}>Sáng</Button>
          <Button size="sm" variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}>Tối</Button>
          <Button size="sm" variant={theme === 'system' ? 'default' : 'outline'} onClick={() => setTheme('system')}>Hệ thống</Button>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Cỡ chữ</Label>
        <div className="flex gap-1 flex-wrap">
          {FONT_SIZES.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={fontSize === s.value ? 'default' : 'outline'}
              onClick={() => update(s.value, fontFamily)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Phông chữ</Label>
        <div className="flex gap-1 flex-wrap">
          {FONT_FAMILIES.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={fontFamily === f.value ? 'default' : 'outline'}
              onClick={() => update(fontSize, f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

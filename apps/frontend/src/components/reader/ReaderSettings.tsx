import { RotateCcw } from 'lucide-react';
import { useReaderPrefs, type ReaderTheme, type ReaderFontSize, type ReaderFontFamily } from '@/stores/reader-prefs-store';

const THEMES: { label: string; value: ReaderTheme }[] = [
  { label: 'Sáng', value: 'light' },
  { label: 'Tối', value: 'dark' },
  { label: 'Hệ thống', value: 'system' },
];

const FONT_SIZES: { label: string; value: ReaderFontSize }[] = [
  { label: 'Nhỏ', value: '15' },
  { label: 'Vừa', value: '18' },
  { label: 'To', value: '20' },
  { label: 'Rất to', value: '24' },
];

const FONT_FAMILIES: { label: string; value: ReaderFontFamily }[] = [
  { label: 'Serif', value: 'serif' },
  { label: 'Sans', value: 'sans' },
  { label: 'Mono', value: 'mono' },
];

export function ReaderSettings() {
  const { theme, fontSize, fontFamily, setTheme, setFontSize, setFontFamily } = useReaderPrefs();

  function resetDefaults() {
    setTheme('system');
    setFontSize('18');
    setFontFamily('serif');
  }

  const isDefault = theme === 'system' && fontSize === '18' && fontFamily === 'serif';

  return (
    <div className="space-y-6 text-sm">
      <RadioGroup
        legendId="settings-theme"
        legend="Giao diện"
        options={THEMES}
        value={theme}
        onChange={setTheme}
      />
      <RadioGroup
        legendId="settings-fontsize"
        legend="Cỡ chữ (nội dung chương)"
        options={FONT_SIZES}
        value={fontSize}
        onChange={setFontSize}
      />
      <RadioGroup
        legendId="settings-fontfamily"
        legend="Phông chữ (nội dung chương)"
        options={FONT_FAMILIES}
        value={fontFamily}
        onChange={setFontFamily}
      />

      <div className="pt-2 border-t border-border/60 flex justify-end">
        <button
          type="button"
          onClick={resetDefaults}
          disabled={isDefault}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Khôi phục mặc định
        </button>
      </div>
    </div>
  );
}

function RadioGroup<T extends string>({
  legendId,
  legend,
  options,
  value,
  onChange,
}: {
  legendId: string;
  legend: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={legendId}>
      <p id={legendId} className="mb-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {legend}
      </p>
      <div className="flex gap-1 flex-wrap">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={
                active
                  ? 'inline-flex items-center h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2'
                  : 'inline-flex items-center h-8 px-3 rounded-md text-sm border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

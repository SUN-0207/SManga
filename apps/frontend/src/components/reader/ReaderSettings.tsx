import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useReaderPrefs } from '@/stores/reader-prefs-store';

const FONT_SIZES = [
  { label: 'Nhỏ', value: '15' },
  { label: 'Vừa', value: '18' },
  { label: 'To', value: '20' },
  { label: 'Rất to', value: '24' },
] as const;

const FONT_FAMILIES = [
  { label: 'Serif', value: 'serif' },
  { label: 'Sans', value: 'sans' },
  { label: 'Mono', value: 'mono' },
] as const;

export function ReaderSettings() {
  const { theme, fontSize, fontFamily, setTheme, setFontSize, setFontFamily } = useReaderPrefs();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
      <div>
        <Label className="mb-2 block">Giao diện</Label>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={theme === 'light' ? 'default' : 'outline'}
            onClick={() => setTheme('light')}
            className="cursor-pointer transition-all duration-200"
          >
            Sáng
          </Button>
          <Button
            size="sm"
            variant={theme === 'dark' ? 'default' : 'outline'}
            onClick={() => setTheme('dark')}
            className="cursor-pointer transition-all duration-200"
          >
            Tối
          </Button>
          <Button
            size="sm"
            variant={theme === 'system' ? 'default' : 'outline'}
            onClick={() => setTheme('system')}
            className="cursor-pointer transition-all duration-200"
          >
            Hệ thống
          </Button>
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
              onClick={() => setFontSize(s.value)}
              className="cursor-pointer transition-all duration-200"
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
              onClick={() => setFontFamily(f.value)}
              className="cursor-pointer transition-all duration-200"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

import {
  type ReaderFontFamily,
  type ReaderFontSize,
  type ReaderTheme,
  useReaderPrefs,
} from '@/stores/reader-prefs-store';
import { RotateCcw } from 'lucide-react';
// apps/frontend/src/components/reader/ReaderSettings.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Animation: per Spec B risk-mitigation, we use CSS-only sliding pill
// (NOT View Transitions API) for Firefox compat + simplicity. See plan Task 5.

const THEMES = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
  { value: 'system', label: 'Hệ thống' },
] as const satisfies readonly { value: ReaderTheme; label: string }[];

const FONT_SIZES = [
  { value: '15', label: 'Nhỏ' },
  { value: '18', label: 'Vừa' },
  { value: '20', label: 'To' },
  { value: '24', label: 'Rất to' },
] as const satisfies readonly { value: ReaderFontSize; label: string }[];

const FONT_FAMILIES = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'mono', label: 'Mono' },
] as const satisfies readonly { value: ReaderFontFamily; label: string }[];

const DEFAULT_THEME: ReaderTheme = 'light';
// '20' = "To". Mirrors the store default so the "Khôi phục mặc định"
// button + the isDefault check stay in sync after the bump from '18'.
const DEFAULT_SIZE: ReaderFontSize = '20';
const DEFAULT_FAMILY: ReaderFontFamily = 'serif';

export function ReaderSettings() {
  const { theme, fontSize, fontFamily, setTheme, setFontSize, setFontFamily } = useReaderPrefs();

  // Local reset helper — the store does NOT export a `reset` action.
  // Could be promoted to the store later if needed elsewhere (out of scope here).
  function resetDefaults() {
    setTheme(DEFAULT_THEME);
    setFontSize(DEFAULT_SIZE);
    setFontFamily(DEFAULT_FAMILY);
  }

  const isDefault =
    theme === DEFAULT_THEME && fontSize === DEFAULT_SIZE && fontFamily === DEFAULT_FAMILY;

  return (
    <div className="space-y-7">
      <Field label="Giao diện">
        <SegmentedControl value={theme} options={THEMES} onChange={(v) => setTheme(v)} />
      </Field>

      <Field label="Cỡ chữ">
        <SegmentedControl value={fontSize} options={FONT_SIZES} onChange={(v) => setFontSize(v)} />
      </Field>

      <Field label="Phông chữ">
        <SegmentedControl
          value={fontFamily}
          options={FONT_FAMILIES}
          onChange={(v) => setFontFamily(v)}
        />
      </Field>

      <LivePreview />

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={resetDefaults}
          disabled={isDefault}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-body-sm text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Khôi phục mặc định
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">{label}</p>
      {children}
    </div>
  );
}

type SegmentOption<V extends string> = { value: V; label: string };

function SegmentedControl<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: readonly SegmentOption<V>[];
  onChange: (v: V) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const activeIdx = options.findIndex((o) => o.value === value);
    const btn = buttonsRef.current[activeIdx];
    const track = trackRef.current;
    if (!btn || !track) return;
    const trackRect = track.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setPillStyle({
      left: btnRect.left - trackRect.left,
      width: btnRect.width,
    });
  }, [value, options]);

  // Re-measure on resize (drawer width changes between sm/md)
  useEffect(() => {
    const handler = () => {
      const activeIdx = options.findIndex((o) => o.value === value);
      const btn = buttonsRef.current[activeIdx];
      const track = trackRef.current;
      if (!btn || !track) return;
      const trackRect = track.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setPillStyle({
        left: btnRect.left - trackRect.left,
        width: btnRect.width,
      });
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [value, options]);

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      className="relative inline-flex w-full items-center gap-0 rounded-full bg-bg-subtle p-1"
    >
      {pillStyle ? (
        <div
          aria-hidden
          // Active pill — per Spec B, use bg-fg/text-bg high-contrast in light theme,
          // bg-bg-elevated in dark. Border + shadow add definition either way.
          className="pointer-events-none absolute top-1 bottom-1 rounded-full border border-border bg-bg-elevated shadow-sm transition-[left,width] duration-200 ease-out dark:border-transparent"
          style={{ left: pillStyle.left, width: pillStyle.width }}
        />
      ) : null}

      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              buttonsRef.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 flex-1 cursor-pointer rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? 'text-fg' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function LivePreview() {
  const { fontSize, fontFamily } = useReaderPrefs();
  const fontClass =
    fontFamily === 'serif' ? 'font-prose' : fontFamily === 'sans' ? 'font-sans' : 'font-mono';

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">
        Bản xem trước
      </p>
      <div className="rounded-lg border border-border bg-bg p-4">
        <p className={`${fontClass} leading-relaxed text-fg`} style={{ fontSize: `${fontSize}px` }}>
          Nàng đặt cuốn sách xuống, nhìn ra ngoài cửa sổ.
          <br />
          Phố Hà Nội mùa thu, lá vàng rơi trên những con đường cũ.
          <br />
          Câu chuyện trong sách dường như vẫn đang tiếp diễn.
        </p>
      </div>
    </div>
  );
}

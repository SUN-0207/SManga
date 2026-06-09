import { Logo } from '@/components/ui/Logo';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

type AuthShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
};

export function AuthShell({
  children,
  eyebrow = 'TẠP CHÍ TRUYỆN CHỮ VIỆT',
  title = 'Đọc chậm. Đọc kỹ. Đọc lại.',
  subtitle = 'Một thư viện truyện chữ Việt biên tập như một tạp chí — không quảng cáo, không pop-up.',
}: AuthShellProps) {
  return (
    <div className="min-h-screen w-full bg-bg text-fg lg:grid lg:grid-cols-2">
      {/* LEFT — hero pane (lg+) */}
      <aside
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{
          background: 'linear-gradient(135deg, #0A0A0A 0%, rgba(236,72,153,0.12) 100%)',
        }}
      >
        {/* Top-right pink glow orb */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-[-120px] top-[-120px] h-[420px] w-[420px] rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(236,72,153,0.25) 0%, rgba(236,72,153,0) 70%)',
          }}
        />

        <div className="relative z-10">
          <Link
            to="/"
            aria-label="SManga - Trang chủ"
            className="inline-flex items-center transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
          >
            <Logo size={32} tone="light" />
          </Link>
        </div>

        <div className="relative z-10 space-y-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
            {eyebrow}
          </p>
          <blockquote className="font-sans text-display-md leading-tight text-white">
            {title}
          </blockquote>
          <p className="text-body italic text-white/60">{subtitle}</p>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-white/40">
          <span className="h-px w-10 bg-white/20" />
          <span className="text-[11px] uppercase tracking-[0.18em]">SManga · 2026</span>
        </div>
      </aside>

      {/* RIGHT — form pane */}
      <main className="flex min-h-screen flex-col bg-bg">
        {/* Mobile header (lg- only) */}
        <header className="flex items-center justify-between border-b border-border px-6 py-5 lg:hidden">
          <Link
            to="/"
            aria-label="SManga - Trang chủ"
            className="inline-flex items-center transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            <Logo size={22} />
          </Link>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted">
            {eyebrow}
          </p>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <footer className="border-t border-border px-6 py-5 lg:hidden">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-body-sm text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại trang chủ
          </Link>
        </footer>
      </main>
    </div>
  );
}

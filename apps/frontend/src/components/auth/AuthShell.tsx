import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="hidden lg:flex flex-col justify-between p-12 xl:p-16 bg-gradient-to-br from-pink-50 via-rose-50 to-orange-50 dark:from-pink-950/30 dark:via-rose-950/20 dark:to-orange-950/20 border-r border-border/60">
        <Link
          to="/"
          className="inline-flex items-baseline gap-1.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded w-fit"
        >
          <span className="font-heading font-bold text-3xl tracking-tight transition-opacity duration-200 group-hover:opacity-80">
            SManga
          </span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-medium">
            Tạp chí truyện
          </span>
        </Link>

        <div className="space-y-8 max-w-md">
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium">
            Tạp chí truyện chữ Việt
          </p>
          <blockquote className="font-heading text-4xl xl:text-5xl leading-[1.15] tracking-tight">
            Đọc truyện chữ,
            <br />
            <span className="italic text-muted-foreground">theo cách của bạn.</span>
          </blockquote>
          <ul className="space-y-2.5 text-sm text-foreground/70">
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-1 w-1 rounded-full bg-foreground/40 shrink-0" />
              Tuyển chọn tiểu thuyết tiếng Việt
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-1 w-1 rounded-full bg-foreground/40 shrink-0" />
              Trải nghiệm đọc tối giản, không quảng cáo
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-1 w-1 rounded-full bg-foreground/40 shrink-0" />
              Tủ sách cá nhân, đồng bộ tiến độ đọc
            </li>
          </ul>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded w-fit"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Về trang chủ
        </Link>
      </aside>

      <main className="flex flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="lg:hidden mb-10 text-center">
          <Link
            to="/"
            className="inline-flex items-baseline gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            <span className="font-heading font-bold text-2xl tracking-tight">SManga</span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-medium">
              Tạp chí truyện
            </span>
          </Link>
        </div>
        <div className="w-full max-w-sm">{children}</div>
        <Link
          to="/"
          className="lg:hidden mt-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Về trang chủ
        </Link>
      </main>
    </div>
  );
}

import { FooterGenreBlock } from '@/components/layout/FooterGenreBlock';
import { Logo } from '@/components/ui/Logo';
import { Link } from '@tanstack/react-router';

const linkClass =
  'text-body-sm text-fg-muted hover:text-fg transition-colors duration-fast rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer';

/**
 * Public/reader site footer (rendered by AppShell on all breakpoints):
 * brand + tagline, primary nav, top genres, and a copyright bar.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-bg-subtle">
      <div className="container py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr_1.5fr]">
          {/* Brand */}
          <div>
            <Logo size={28} />
            <p className="mt-4 max-w-xs text-body-sm text-fg-muted leading-relaxed">
              Thư viện truyện chữ Việt — đọc online miễn phí, không quảng cáo, không pop-up.
            </p>
          </div>

          {/* Primary nav */}
          <nav aria-label="Điều hướng chân trang">
            <h4 className="text-label uppercase text-fg-muted mb-3">Điều hướng</h4>
            <ul className="space-y-2 list-none p-0">
              <li>
                <Link to="/" className={linkClass}>
                  Trang chủ
                </Link>
              </li>
              <li>
                <Link
                  to="/kham-pha"
                  search={{ q: '', page: 1, genre: undefined }}
                  className={linkClass}
                >
                  Khám phá
                </Link>
              </li>
              <li>
                <Link to="/bang-xep-hang" search={{ tab: 'hot', page: 1 }} className={linkClass}>
                  Bảng xếp hạng
                </Link>
              </li>
              <li>
                <Link to="/tu-sach" className={linkClass}>
                  Tủ sách
                </Link>
              </li>
            </ul>
          </nav>

          {/* Genres (reused block) */}
          <FooterGenreBlock />
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-body-sm text-fg-muted text-center md:text-left">
            © {year} SManga · Đọc truyện chữ Việt
          </p>
        </div>
      </div>
    </footer>
  );
}

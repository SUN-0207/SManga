import { Logo } from '@/components/ui/Logo';
import { useAuthStore } from '@/stores/auth-store';
import { Link, useRouterState } from '@tanstack/react-router';
import { BookOpen, Compass, Library, Trophy, User, X } from 'lucide-react';
import { useEffect } from 'react';

const NAV = [
  { to: '/', label: 'Đọc', icon: BookOpen, match: (p: string) => p === '/' },
  {
    to: '/kham-pha',
    label: 'Khám phá',
    icon: Compass,
    match: (p: string) => p.startsWith('/kham-pha') || p.startsWith('/tim-kiem'),
  },
  {
    to: '/bang-xep-hang',
    label: 'Bảng xếp hạng',
    icon: Trophy,
    match: (p: string) => p.startsWith('/bang-xep-hang'),
  },
  {
    to: '/tu-sach',
    label: 'Tủ sách',
    icon: Library,
    match: (p: string) => p.startsWith('/tu-sach'),
  },
] as const;

/**
 * Off-canvas mobile nav drawer — slides in from the left.
 * Mirrors DesktopTopNav.NAV exactly so mobile and desktop stay consistent.
 * Logged-in users get a profile entry at the bottom; anonymous users get
 * sign-in / sign-up CTAs. Body scroll is locked while open.
 */
export function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthStore((s) => s.user);

  // Body scroll-lock while drawer is open. Restoring overflow on cleanup
  // matters when the drawer is unmounted mid-open (e.g., route change).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Esc — common drawer affordance, free with keyboard nav.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer panel */}
      <aside
        aria-label="Điều hướng chính"
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 w-[80vw] max-w-xs bg-bg border-r border-border shadow-elev transform transition-transform duration-200 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-border">
          <Link to="/" onClick={onClose} aria-label="SManga - Trang chủ">
            <Logo size={22} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng menu"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-3 flex flex-col gap-1" aria-label="Menu chính">
          {NAV.map((n) => {
            const active = n.match(path);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={onClose}
                className={`flex items-center gap-3 h-11 px-3 rounded-md text-body font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? 'bg-accent/10 text-accent'
                    : 'text-fg-muted hover:bg-bg-subtle hover:text-fg'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-border p-3">
          {user ? (
            // /ban is the mobile-friendly "you" landing — avatar + reading
            // stats + sub-nav to /tu-sach, /tai-khoan, settings, logout. Keep
            // this as the single entry from the drawer so we don't fragment
            // user-profile navigation between /ban and /tai-khoan.
            <Link
              to="/ban"
              onClick={onClose}
              className="flex items-center gap-3 h-11 px-3 rounded-md text-body font-semibold text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <User className="h-5 w-5" aria-hidden />
              Bạn
            </Link>
          ) : (
            <div className="flex flex-col gap-2">
              <Link
                to="/dang-nhap"
                search={{ redirect: '/' }}
                onClick={onClose}
                className="inline-flex items-center justify-center h-10 rounded-md bg-fg text-bg text-body font-semibold hover:opacity-90 transition-opacity duration-fast"
              >
                Đăng nhập
              </Link>
              <Link
                to="/dang-ky"
                search={{ redirect: '/' }}
                onClick={onClose}
                className="inline-flex items-center justify-center h-10 rounded-md border border-border text-body font-semibold hover:bg-bg-subtle transition-colors duration-fast"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

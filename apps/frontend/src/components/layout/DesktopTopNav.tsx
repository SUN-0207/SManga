import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AvatarMenu } from '@/components/reader/AvatarMenu';
import { ReaderSettingsDrawer } from '@/components/reader/ReaderSettingsDrawer';
import { useAuthStore } from '@/stores/auth-store';
// apps/frontend/src/components/layout/DesktopTopNav.tsx
import { Link, useRouterState } from '@tanstack/react-router';
import { Search as SearchIcon } from 'lucide-react';

const NAV = [
  { to: '/' as const, label: 'Đọc', match: (p: string) => p === '/' },
  {
    to: '/kham-pha',
    label: 'Khám phá',
    match: (p: string) => p.startsWith('/kham-pha') || p.startsWith('/tim-kiem'),
  },
  {
    to: '/bang-xep-hang' as const,
    label: 'Bảng xếp hạng',
    match: (p: string) => p.startsWith('/bang-xep-hang'),
  },
  { to: '/tu-sach' as const, label: 'Tủ sách', match: (p: string) => p.startsWith('/tu-sach') },
] as const;

export function DesktopTopNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthStore((s) => s.user);

  return (
    <>
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border/60">
        <div className="container flex items-center h-14 gap-8">
          <Link to="/" className="font-sans font-extrabold text-heading-lg tracking-tight">
            SManga
          </Link>
          <nav className="flex items-center gap-6 flex-1" aria-label="Điều hướng chính">
            {NAV.map((n) => {
              const active = n.match(path);
              return (
                <Link
                  key={n.to}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  to={n.to as any}
                  className={`relative text-body font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded ${
                    active ? 'text-fg' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {n.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -bottom-[18px] left-0 right-0 h-0.5 bg-accent-gradient rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {/* Search icon links to /tim-kiem (real route) until /kham-pha route lands */}
            <Link
              to="/tim-kiem"
              search={{ q: '', page: 1 }}
              aria-label="Tìm kiếm"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <SearchIcon className="h-4 w-4" />
            </Link>
            <NotificationBell />
            {user ? (
              <AvatarMenu user={user} />
            ) : (
              <Link
                to="/dang-nhap"
                search={{ redirect: '/' }}
                className="inline-flex items-center h-9 px-4 rounded-md text-body font-semibold bg-fg text-bg hover:opacity-90 transition-opacity duration-fast"
              >
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </header>
      <ReaderSettingsDrawer />
    </>
  );
}

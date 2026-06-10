import { MobileNavDrawer } from '@/components/layout/MobileNavDrawer';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SearchModal } from '@/components/search/SearchModal';
import { Logo } from '@/components/ui/Logo';
import { useAuthStore } from '@/stores/auth-store';
import { Link } from '@tanstack/react-router';
import { Menu, Search as SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { AvatarMenu } from './AvatarMenu';
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer';

/**
 * Mobile-only mini header (rendered <lg by AppShell).
 * Desktop uses DesktopTopNav instead. The hamburger button opens
 * MobileNavDrawer, which mirrors DesktopTopNav.NAV one-to-one so the
 * primary nav stays consistent across breakpoints.
 */
export function ReaderHeader() {
  const user = useAuthStore((s) => s.user);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border/60">
        <div className="container flex items-center justify-between h-12 gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Mở menu"
              aria-expanded={navOpen}
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" aria-label="SManga - Trang chủ">
              <Logo size={22} />
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Tìm kiếm"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
            >
              <SearchIcon className="h-4 w-4" />
            </button>
            <NotificationBell />
            {user ? (
              <AvatarMenu user={user} />
            ) : (
              <Link
                to="/dang-nhap"
                search={{ redirect: '/' }}
                className="inline-flex items-center h-9 px-3 rounded-md text-body-sm font-semibold bg-fg text-bg hover:opacity-90 transition-opacity duration-fast"
              >
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </header>
      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ReaderSettingsDrawer />
    </>
  );
}

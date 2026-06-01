import { Link } from '@tanstack/react-router';
import { Search as SearchIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { AvatarMenu } from './AvatarMenu';
import { ReaderSettingsDrawer } from './ReaderSettingsDrawer';
import { NotificationBell } from '@/components/notifications/NotificationBell';

/**
 * Mobile-only mini header (rendered <lg by AppShell).
 * Desktop uses DesktopTopNav instead.
 */
export function ReaderHeader() {
  const user = useAuthStore((s) => s.user);
  return (
    <>
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border/60">
        <div className="container flex items-center justify-between h-12 gap-2">
          <Link to="/" className="font-sans font-extrabold text-heading-lg tracking-tight">
            SManga
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/tim-kiem"
              search={{ q: '', page: 1 }}
              aria-label="Tìm kiếm"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors duration-fast"
            >
              <SearchIcon className="h-4 w-4" />
            </Link>
            <NotificationBell />
            {user ? <AvatarMenu user={user} /> : (
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
      <ReaderSettingsDrawer />
    </>
  );
}

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Library,
  LogIn,
  Search as SearchIcon,
  Settings as SettingsIcon,
  User,
  X,
} from 'lucide-react';
import { ReaderSettings } from './ReaderSettings';
import { useAuthStore } from '@/stores/auth-store';

export function ReaderHeader() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const user = useAuthStore((s) => s.user);

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-background/85 border-b border-border/60">
      <div className="container flex items-center justify-between h-16 gap-3">
        <Link
          to="/"
          className="group inline-flex items-baseline gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded shrink-0"
        >
          <span className="font-heading font-bold text-2xl tracking-tight leading-none transition-opacity duration-200 group-hover:opacity-80">
            SManga
          </span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-medium">
            Tạp chí truyện
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-1">
          <Link
            to="/"
            className="hidden md:inline-flex items-center h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Trang chủ
          </Link>
          <Link
            to="/tim-kiem"
            search={{ q: '', page: 1 }}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Tìm kiếm"
          >
            <SearchIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Tìm kiếm</span>
          </Link>
          {user ? (
            <Link
              to="/tu-sach"
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Tủ sách của bạn"
            >
              <Library className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Tủ sách</span>
            </Link>
          ) : (
            <Link
              to="/dang-nhap"
              search={{ redirect: '/tu-sach' }}
              className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              Đăng nhập
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            aria-label={settingsOpen ? 'Đóng cài đặt' : 'Mở cài đặt'}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {settingsOpen ? <X className="h-4 w-4" aria-hidden /> : <SettingsIcon className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">Cài đặt</span>
          </button>
          {user && (
            <span
              className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 text-xs text-muted-foreground border-l border-border ml-1"
              title={user.email}
            >
              <User className="h-3.5 w-3.5" aria-hidden />
              {user.email.split('@')[0]}
            </span>
          )}
        </nav>
      </div>
      {settingsOpen && (
        <div className="border-t border-border/60 bg-muted/40">
          <div className="container py-4">
            <ReaderSettings />
          </div>
        </div>
      )}
    </header>
  );
}

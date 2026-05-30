import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Library,
  LogIn,
  LogOut,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Shield,
  User,
  X,
} from 'lucide-react';
import { ReaderSettings } from './ReaderSettings';
import { useAuthStore } from '@/stores/auth-store';
import { logout as logoutApi } from '@/api/auth';

export function ReaderHeader() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [userMenuOpen]);

  async function handleLogout() {
    try {
      await logoutApi();
    } catch {
      /* even on error force-reset client state below */
    }
    useAuthStore.getState().setUser(null);
    setUserMenuOpen(false);
    window.location.href = '/';
  }

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
            <SearchIcon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Tìm kiếm</span>
          </Link>
          {user ? (
            <>
              <Link
                to="/tu-sach"
                className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Tủ sách của bạn"
              >
                <Library className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Tủ sách</span>
              </Link>
              {user.role === 'admin' && (
                <a
                  href="/admin"
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-foreground/20 hover:border-foreground/40 hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Vào trang quản trị"
                >
                  <Shield className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Quản trị</span>
                </a>
              )}
            </>
          ) : (
            <Link
              to="/dang-nhap"
              search={{ redirect: '/tu-sach' }}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Đăng nhập</span>
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
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={`Tài khoản ${user.email}`}
                className="inline-flex items-center gap-1.5 h-9 px-2 sm:px-3 ml-0.5 sm:ml-1 sm:border-l sm:border-border rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-foreground/10 text-foreground/80 text-xs font-semibold uppercase">
                  {user.email[0] ?? 'U'}
                </span>
                <span className="hidden lg:inline text-xs text-muted-foreground max-w-[8rem] truncate">
                  {user.email.split('@')[0]}
                </span>
              </button>
              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1.5 w-60 rounded-lg border border-border bg-background shadow-lg p-1.5 z-40"
                >
                  <div className="px-3 py-2 border-b border-border/60 mb-1">
                    <p className="text-xs text-muted-foreground">Đăng nhập với</p>
                    <p className="text-sm font-medium truncate" title={user.email}>
                      {user.email}
                    </p>
                  </div>
                  {user.role === 'admin' && (
                    <a
                      href="/admin"
                      className="flex items-center gap-2 h-9 px-3 rounded-md text-sm hover:bg-muted/70 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      role="menuitem"
                    >
                      <Shield className="h-4 w-4" aria-hidden />
                      Trang quản trị
                    </a>
                  )}
                  <Link
                    to="/tu-sach"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 h-9 px-3 rounded-md text-sm hover:bg-muted/70 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    role="menuitem"
                  >
                    <User className="h-4 w-4" aria-hidden />
                    Tủ sách của bạn
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    role="menuitem"
                    className="w-full flex items-center gap-2 h-9 px-3 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
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

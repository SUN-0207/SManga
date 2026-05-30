import { Fragment, useEffect, useRef, useState } from 'react';
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

  // Esc closes the settings drawer
  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

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
    <Fragment>
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
            <Link
              to="/tu-sach"
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Tủ sách của bạn"
            >
              <Library className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Tủ sách</span>
            </Link>
          ) : (
            <>
              <Link
                to="/dang-nhap"
                search={{ redirect: '/tu-sach' }}
                className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Đăng nhập</span>
              </Link>
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
            </>
          )}
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
                {user.image ? (
                  <img
                    src={user.image}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-foreground/10 text-foreground/80 text-xs font-semibold uppercase">
                    {(user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase()}
                  </span>
                )}
                <span className="hidden lg:inline text-xs text-muted-foreground max-w-[8rem] truncate">
                  {user.name ?? user.email.split('@')[0]}
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
                  <Link
                    to="/tu-sach"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 h-9 px-3 rounded-md text-sm hover:bg-muted/70 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    role="menuitem"
                  >
                    <Library className="h-4 w-4" aria-hidden />
                    Tủ sách của bạn
                  </Link>
                  <Link
                    to="/tai-khoan"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 h-9 px-3 rounded-md text-sm hover:bg-muted/70 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    role="menuitem"
                  >
                    <User className="h-4 w-4" aria-hidden />
                    Tài khoản
                  </Link>
                  {user.role === 'admin' && (
                    <a
                      href="/admin"
                      className="flex items-center gap-2 h-9 px-3 rounded-md text-sm hover:bg-muted/70 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      role="menuitem"
                    >
                      <Shield className="h-4 w-4" aria-hidden />
                      Quản trị
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen((v) => !v);
                      setUserMenuOpen(false);
                    }}
                    role="menuitem"
                    className="w-full flex items-center gap-2 h-9 px-3 rounded-md text-sm hover:bg-muted/70 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <SettingsIcon className="h-4 w-4" aria-hidden />
                    Cài đặt
                  </button>
                  <div className="my-1 border-t border-border/60" />
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
    </header>
    {settingsOpen && (
      <button
        type="button"
        onClick={() => setSettingsOpen(false)}
        aria-label="Đóng cài đặt"
        className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
      />
    )}
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Cài đặt đọc"
      aria-hidden={!settingsOpen}
      className={`fixed top-0 right-0 bottom-0 z-50 w-80 sm:w-96 bg-background border-l border-border shadow-xl flex flex-col transform transition-transform duration-200 ${
        settingsOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-14 sm:h-16 px-4 sm:px-5 flex items-center justify-between border-b border-border shrink-0">
        <h2 className="font-heading font-semibold text-base">Cài đặt đọc</h2>
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          aria-label="Đóng cài đặt"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        <ReaderSettings />
      </div>
    </aside>
    </Fragment>
  );
}

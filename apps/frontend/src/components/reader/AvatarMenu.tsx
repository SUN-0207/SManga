import { logout as logoutApi } from '@/api/auth';
import type { User as UserType } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { useReaderPrefs } from '@/stores/reader-prefs-store';
import { Link } from '@tanstack/react-router';
import { Library, LogOut, Settings as SettingsIcon, Shield, User } from 'lucide-react';
// apps/frontend/src/components/reader/AvatarMenu.tsx
import { useEffect, useRef, useState } from 'react';

export function AvatarMenu({ user }: { user: UserType }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const setSettingsOpen = useReaderPrefs((s) => s.setSettingsOpen);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleLogout() {
    try {
      await logoutApi();
    } catch {
      /* force-reset below */
    }
    useAuthStore.getState().setUser(null);
    setOpen(false);
    window.location.href = '/';
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản ${user.email}`}
        className="inline-flex items-center gap-2 h-9 px-1.5 rounded-md hover:bg-bg-subtle transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {user.image ? (
          <img src={user.image} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-accent-gradient text-white text-body-sm font-bold uppercase">
            {(user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-60 rounded-lg border border-border bg-bg-elevated shadow-elev p-1.5 z-40"
        >
          <div className="px-3 py-2 border-b border-border/60 mb-1">
            <p className="text-body-sm text-fg-muted">Đăng nhập với</p>
            <p className="text-body font-medium truncate" title={user.email}>
              {user.email}
            </p>
          </div>
          <Link
            to="/tu-sach"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-2 h-9 px-3 rounded-md text-body hover:bg-bg-subtle transition-colors duration-fast"
          >
            <Library className="h-4 w-4" aria-hidden /> Tủ sách của bạn
          </Link>
          <Link
            to="/tai-khoan"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-2 h-9 px-3 rounded-md text-body hover:bg-bg-subtle transition-colors duration-fast"
          >
            <User className="h-4 w-4" aria-hidden /> Tài khoản
          </Link>
          {user.role === 'admin' && (
            <a
              href="/admin"
              role="menuitem"
              className="flex items-center gap-2 h-9 px-3 rounded-md text-body hover:bg-bg-subtle transition-colors duration-fast"
            >
              <Shield className="h-4 w-4" aria-hidden /> Quản trị
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
              setOpen(false);
            }}
            role="menuitem"
            className="w-full flex items-center gap-2 h-9 px-3 rounded-md text-body hover:bg-bg-subtle transition-colors duration-fast"
          >
            <SettingsIcon className="h-4 w-4" aria-hidden /> Cài đặt
          </button>
          <div className="my-1 border-t border-border/60" />
          <button
            type="button"
            onClick={handleLogout}
            role="menuitem"
            className="w-full flex items-center gap-2 h-9 px-3 rounded-md text-body text-destructive hover:bg-destructive/10 transition-colors duration-fast"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

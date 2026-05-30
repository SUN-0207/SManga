import { useEffect, useState } from 'react';
import { createFileRoute, Outlet, Link, redirect, useRouterState } from '@tanstack/react-router';
import {
  Activity,
  BookOpen,
  Database,
  LayoutDashboard,
  LogOut,
  ExternalLink,
  Menu,
  Settings as SettingsIcon,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { me } from '@/api/auth';
import { api } from '@/lib/api-client';

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await me();
    if (!user) throw redirect({ to: '/dang-nhap', search: { redirect: '/admin' } });
    if (user.role !== 'admin') throw redirect({ to: '/' });
    useAuthStore.getState().setUser(user);
  },
  component: AdminLayout,
});

const NAV = [
  { href: '/admin' as const, label: 'Tổng quan', icon: LayoutDashboard, exact: true },
  { href: '/admin/sources' as const, label: 'Sources', icon: Database, exact: false },
  { href: '/admin/stories' as const, label: 'Truyện', icon: BookOpen, exact: false },
  { href: '/admin/jobs' as const, label: 'Jobs', icon: Activity, exact: false },
  { href: '/admin/users' as const, label: 'Người dùng', icon: Users, exact: false },
  { href: '/admin/settings' as const, label: 'Cài đặt', icon: SettingsIcon, exact: false },
];

function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [path]);

  async function logout() {
    await api.post('/auth/logout');
    useAuthStore.getState().setUser(null);
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen flex bg-muted/20">
      {/* Desktop sidebar: persistent on md+ */}
      <aside className="hidden md:flex w-60 border-r border-border bg-background flex-col shrink-0 sticky top-0 h-screen self-start">
        <SidebarBrand />
        <SidebarNav path={path} />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer: overlay + slide-in panel */}
      {mobileNavOpen && (
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Đóng menu"
          className="md:hidden fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
        />
      )}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border flex flex-col transform transition-transform duration-200 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!mobileNavOpen}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
          <Link
            to="/admin"
            className="inline-flex items-baseline gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            <span className="font-heading font-bold text-base tracking-tight leading-none">
              SManga
            </span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-medium">
              Admin
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Đóng menu"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <SidebarNav path={path} />
        <SidebarFooter />
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="sticky top-0 z-30 h-14 sm:h-16 border-b border-border bg-background/95 backdrop-blur-md flex items-center px-3 sm:px-6 gap-2">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Mở menu"
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted/70 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="md:hidden font-heading font-semibold text-sm">SManga Admin</span>
          <div className="flex-1" />
          <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[12rem]">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Đăng xuất
          </button>
        </div>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SidebarBrand() {
  return (
    <div className="h-16 px-5 flex items-center border-b border-border shrink-0">
      <Link
        to="/admin"
        className="inline-flex items-baseline gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
      >
        <span className="font-heading font-bold text-lg tracking-tight leading-none">
          SManga
        </span>
        <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-medium">
          Admin
        </span>
      </Link>
    </div>
  );
}

function SidebarNav({ path }: { path: string }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
      <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-medium">
        Quản trị
      </p>
      {NAV.map((n) => {
        const active = n.exact ? path === n.href : path.startsWith(n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            to={n.href}
            className={`flex items-center gap-2.5 h-9 px-3 rounded-md text-sm transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active
                ? 'bg-foreground text-background font-medium'
                : 'hover:bg-muted text-foreground/80'
            }`}
          >
            <Icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="px-3 py-4 border-t border-border space-y-0.5 shrink-0">
      <a
        href="/"
        className="flex items-center gap-2.5 h-9 px-3 rounded-md text-sm hover:bg-muted text-foreground/80 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ExternalLink className="h-4 w-4" />
        Xem trang đọc
      </a>
    </div>
  );
}

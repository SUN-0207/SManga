import { me } from '@/api/auth';
import { getReportsOpenCount } from '@/api/reports';
import { SEO } from '@/components/seo/SEO';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Database,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

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
  { href: '/admin/reports' as const, label: 'Báo lỗi', icon: AlertTriangle, exact: false },
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
    <div className="min-h-screen flex bg-bg">
      <SEO title="Admin | SManga" description="" canonical="/admin" robots="noindex" />
      {/* Desktop sidebar: persistent on md+ */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-col self-start border-r border-border bg-bg md:flex">
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
          className="md:hidden fixed inset-0 z-40 bg-fg/40 backdrop-blur-sm"
        />
      )}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-bg border-r border-border flex flex-col transform transition-transform duration-200 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!mobileNavOpen}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 font-sans text-base font-semibold tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
          >
            SManga
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted">
              ADMIN
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Đóng menu"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <MobileDrawerNav path={path} onClose={() => setMobileNavOpen(false)} />
        <SidebarFooter />
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/95 px-4 backdrop-blur-md sm:h-16 sm:px-6">
          {/* Mobile hamburger (left) */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Mở menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile label */}
          <p className="font-sans text-body-sm font-semibold text-fg md:hidden">SManga Admin</p>

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-3">
            <p className="hidden text-body-sm text-fg-muted md:block">{user?.email}</p>
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-bg px-3 text-body-sm font-medium text-fg transition-colors duration-fast hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </header>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-16 items-center border-b border-border/60 px-5">
      <Link
        to="/admin"
        className="inline-flex items-center gap-2 font-sans text-lg font-semibold tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
      >
        SManga
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted">
          ADMIN
        </span>
      </Link>
    </div>
  );
}

function SidebarNav({ path }: { path: string }) {
  const openCountQ = useQuery({
    queryKey: ['admin', 'reports', 'open-count'],
    queryFn: getReportsOpenCount,
    refetchInterval: 60_000,
  });
  const openCount = openCountQ.data?.openCount ?? 0;

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
      <p className="px-3 mb-2 text-[10px] font-medium uppercase tracking-[0.25em] text-fg-muted">
        Quản trị
      </p>
      {NAV.map((n) => {
        const active = n.exact ? path === n.href : path.startsWith(n.href);
        const Icon = n.icon;
        const showBadge = n.href === '/admin/reports' && openCount > 0;
        return (
          <Link
            key={n.href}
            to={n.href}
            className={
              active
                ? 'group flex h-9 items-center gap-2.5 rounded-md bg-gradient-to-r from-accent to-accent-strong px-3 text-body-sm font-medium text-white shadow-glow-pink-soft transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer'
                : 'group flex h-9 items-center gap-2.5 rounded-md px-3 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer'
            }
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{n.label}</span>
            {showBadge && (
              <span className="ml-auto inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-accent px-1 text-[10px] font-semibold text-white tabular-nums">
                {openCount > 99 ? '99+' : openCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="px-3 py-4 border-t border-border space-y-0.5 shrink-0">
      <Link
        to="/"
        className="group flex h-9 items-center gap-2.5 rounded-md px-3 text-body-sm font-medium text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
      >
        <ExternalLink className="h-4 w-4" />
        Xem trang đọc
      </Link>
    </div>
  );
}

function MobileDrawerNav({ path, onClose }: { path: string; onClose: () => void }) {
  const openCountQ = useQuery({
    queryKey: ['admin', 'reports', 'open-count'],
    queryFn: getReportsOpenCount,
    refetchInterval: 60_000,
  });
  const openCount = openCountQ.data?.openCount ?? 0;

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
      {NAV.map((n) => {
        const active = n.exact ? path === n.href : path.startsWith(n.href);
        const Icon = n.icon;
        const showBadge = n.href === '/admin/reports' && openCount > 0;
        return (
          <Link
            key={n.href}
            to={n.href}
            onClick={onClose}
            className={
              active
                ? 'group flex h-9 items-center gap-2.5 rounded-md bg-gradient-to-r from-accent to-accent-strong px-3 text-body-sm font-medium text-white shadow-glow-pink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer'
                : 'group flex h-9 items-center gap-2.5 rounded-md px-3 text-body-sm font-medium text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer'
            }
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{n.label}</span>
            {showBadge && (
              <span className="ml-auto inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-accent px-1 text-[10px] font-semibold text-white tabular-nums">
                {openCount > 99 ? '99+' : openCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

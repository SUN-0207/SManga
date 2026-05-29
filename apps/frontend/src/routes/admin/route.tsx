import { createFileRoute, Outlet, Link, redirect, useRouterState } from '@tanstack/react-router';
import {
  Activity,
  BookOpen,
  Database,
  LayoutDashboard,
  LogOut,
  ExternalLink,
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
];

function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const path = useRouterState({ select: (s) => s.location.pathname });

  async function logout() {
    await api.post('/auth/logout');
    useAuthStore.getState().setUser(null);
    // Reset to '/' via full reload so all queries (jobs/stats, sources, etc.) tear down cleanly
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen flex bg-muted/20">
      <aside className="w-60 border-r border-border bg-background flex flex-col shrink-0">
        <div className="h-16 px-5 flex items-center border-b border-border">
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

        <nav className="flex-1 px-3 py-4 space-y-0.5">
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

        <div className="px-3 py-4 border-t border-border space-y-0.5">
          <a
            href="/"
            className="flex items-center gap-2.5 h-9 px-3 rounded-md text-sm hover:bg-muted text-foreground/80 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ExternalLink className="h-4 w-4" />
            Xem trang đọc
          </a>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="h-16 border-b border-border bg-background flex items-center justify-end px-6 gap-3">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
        <div className="flex-1 p-6 sm:p-8 max-w-6xl w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

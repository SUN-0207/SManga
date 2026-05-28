import { createFileRoute, Outlet, Link, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth-store';
import { me } from '@/api/auth';
import { Button } from '@/components/ui/button';
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
  { href: '/admin' as const, label: 'Tổng quan' },
  { href: '/admin/sources' as const, label: 'Sources' },
  { href: '/admin/stories' as const, label: 'Truyện' },
  { href: '/admin/jobs' as const, label: 'Jobs' },
];

function AdminLayout() {
  const user = useAuthStore((s) => s.user);

  async function logout() {
    await api.post('/auth/logout');
    useAuthStore.getState().setUser(null);
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-border bg-muted/30 p-4 space-y-1 shrink-0">
        <Link to="/admin" className="block font-semibold text-lg mb-4 cursor-pointer">
          SManga Admin
        </Link>
        {NAV.map((n) => (
          <Link
            key={n.href}
            to={n.href}
            className="block rounded px-3 py-2 hover:bg-muted text-sm cursor-pointer transition-colors duration-150"
          >
            {n.label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-6 min-w-0">
        <div className="flex items-center justify-end gap-4 mb-6 text-sm">
          <span className="text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={logout} className="cursor-pointer">
            Đăng xuất
          </Button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

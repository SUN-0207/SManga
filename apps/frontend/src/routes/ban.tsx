import { createFileRoute, redirect, Link } from '@tanstack/react-router';
import { Library, User as UserIcon, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { me, logout as logoutApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { useReaderPrefs } from '@/stores/reader-prefs-store';
import { ReadingStatsCard } from '@/components/reader/ReadingStatsCard';

export const Route = createFileRoute('/ban')({
  beforeLoad: async () => {
    const user = await me();
    if (!user) throw redirect({ to: '/dang-nhap', search: { redirect: '/ban' } });
    useAuthStore.getState().setUser(user);
  },
  component: BanPage,
});

function BanPage() {
  const user = useAuthStore((s) => s.user)!;
  const setSettingsOpen = useReaderPrefs((s) => s.setSettingsOpen);

  async function handleLogout() {
    try { await logoutApi(); } catch { /* force-reset below */ }
    useAuthStore.getState().setUser(null);
    window.location.href = '/';
  }

  const fallbackInitial = (user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14 space-y-8">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-fg-muted">
          CỦA BẠN
        </p>
        <div className="flex items-center gap-4">
          {user.image ? (
            <img src={user.image} alt="" className="h-12 w-12 rounded-full object-cover border border-border" />
          ) : (
            <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-accent-gradient text-white text-heading-md font-bold">
              {fallbackInitial}
            </span>
          )}
          <div>
            <h1 className="font-sans text-display-sm text-fg">
              {user.name ?? user.email}
            </h1>
            <p className="text-body-sm text-fg-muted">{user.email}</p>
          </div>
        </div>
      </header>

      <ReadingStatsCard />

      <nav aria-label="Điều hướng tài khoản">
        <ul className="space-y-2">
          <li>
            <Link
              to="/tu-sach"
              className="flex items-center gap-3 h-12 px-4 rounded-lg border border-border bg-bg-elevated hover:bg-bg-subtle transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
            >
              <Library className="h-5 w-5 text-fg-muted flex-shrink-0" aria-hidden />
              <span className="text-body font-medium">Tủ sách của bạn</span>
            </Link>
          </li>
          <li>
            <Link
              to="/tai-khoan"
              className="flex items-center gap-3 h-12 px-4 rounded-lg border border-border bg-bg-elevated hover:bg-bg-subtle transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
            >
              <UserIcon className="h-5 w-5 text-fg-muted flex-shrink-0" aria-hidden />
              <span className="text-body font-medium">Tài khoản</span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-full flex items-center gap-3 h-12 px-4 rounded-lg border border-border bg-bg-elevated hover:bg-bg-subtle transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
            >
              <SettingsIcon className="h-5 w-5 text-fg-muted flex-shrink-0" aria-hidden />
              <span className="text-body font-medium">Cài đặt</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 h-12 px-4 rounded-lg border border-border bg-bg-elevated hover:bg-destructive/10 text-destructive transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden />
              <span className="text-body font-medium">Đăng xuất</span>
            </button>
          </li>
        </ul>
      </nav>
    </main>
  );
}

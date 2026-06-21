import { AppShell } from '@/components/layout/AppShell';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { useMeQuery } from '@/hooks/use-auth';
import { useDailyCheckin } from '@/hooks/use-daily-checkin';
import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext, useRouterState } from '@tanstack/react-router';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  useMeQuery();
  const { message: checkinMessage } = useDailyCheckin();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Routes that own their own shell (no reader chrome):
  //   /admin/* — admin uses its own AdminLayout
  //   /dang-nhap, /dang-ky — auth uses AuthShell
  const ownsShell = path.startsWith('/admin') || path === '/dang-nhap' || path === '/dang-ky';
  return (
    <ThemeProvider>
      {checkinMessage && (
        <output
          aria-live="polite"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-accent text-white text-body-sm font-semibold shadow-glow-pink animate-fade-in"
        >
          {checkinMessage}
        </output>
      )}
      {ownsShell ? (
        <Outlet />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
    </ThemeProvider>
  );
}

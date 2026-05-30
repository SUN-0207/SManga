import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';
import { useMeQuery } from '@/hooks/use-auth';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  useMeQuery();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Routes that own their own shell (no reader chrome):
  //   /admin/* — admin uses its own AdminLayout
  //   /dang-nhap, /dang-ky — auth uses AuthShell
  const ownsShell =
    path.startsWith('/admin') ||
    path === '/dang-nhap' ||
    path === '/dang-ky';
  return (
    <ThemeProvider>
      {ownsShell ? <Outlet /> : <AppShell><Outlet /></AppShell>}
    </ThemeProvider>
  );
}

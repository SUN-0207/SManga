import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ReaderHeader } from '@/components/reader/ReaderHeader';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <ReaderHeader />
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="border-t border-border py-6 text-sm text-center text-muted-foreground">
          SManga · Đọc truyện chữ
        </footer>
      </div>
    </ThemeProvider>
  ),
});

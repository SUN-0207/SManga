import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
// TODO(Task 6): replace stub with real DesktopTopNav import
// import { DesktopTopNav } from './DesktopTopNav';
import { BottomTabBar } from './BottomTabBar';
// TODO(Task 7): replace stub with real ContinueReadingBar import
// import { ContinueReadingBar } from './ContinueReadingBar';
import { ReaderHeader } from '@/components/reader/ReaderHeader';

// Stubs — Tasks 6-7 will replace these with real implementations
const DesktopTopNav = () => (
  <div className="h-14 border-b border-border px-6 flex items-center">
    <span className="font-sans font-extrabold text-heading-lg">SManga</span>
  </div>
);
const ContinueReadingBar = () => null;

/**
 * Reader root layout. Renders:
 *   Desktop (≥1024px):  DesktopTopNav (sticky) → ContinueReadingBar → main → footer
 *   Mobile (<1024px):   ReaderHeader (mini) → ContinueReadingBar → main → BottomTabBar
 *
 * Bottom tab bar hides on chapter reader routes (full-screen reading).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isChapter = /^\/truyen\/[^/]+\/chuong\/[^/]+/.test(path);

  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <div className="hidden lg:block">
        <DesktopTopNav />
      </div>
      <div className="lg:hidden">
        <ReaderHeader />
      </div>
      {!isChapter && <ContinueReadingBar />}
      <main className="flex-1">{children}</main>
      {!isChapter && (
        <div className="lg:hidden">
          <BottomTabBar />
        </div>
      )}
      <footer className="hidden lg:block border-t border-border py-6 text-body-sm text-fg-muted text-center">
        SManga · Đọc truyện chữ
      </footer>
    </div>
  );
}

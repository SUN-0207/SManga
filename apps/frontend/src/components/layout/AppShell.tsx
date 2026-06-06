import { ReaderHeader } from '@/components/reader/ReaderHeader';
import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { BottomTabBar } from './BottomTabBar';
import { DesktopTopNav } from './DesktopTopNav';

/**
 * Reader root layout. Renders:
 *   Desktop (≥1024px):  DesktopTopNav (sticky) → main → footer
 *   Mobile (<1024px):   ReaderHeader (mini) → main → BottomTabBar
 *
 * Bottom tab bar hides on chapter reader routes (full-screen reading).
 * Continue-reading is surfaced via the LoggedInHero on /, no global bar needed.
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
      <main
        className={
          !isChapter ? 'flex-1 pb-[calc(env(safe-area-inset-bottom)+72px)] lg:pb-0' : 'flex-1'
        }
      >
        {children}
      </main>
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

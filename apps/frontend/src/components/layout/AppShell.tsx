import { ReaderHeader } from '@/components/reader/ReaderHeader';
import type { ReactNode } from 'react';
import { DesktopTopNav } from './DesktopTopNav';
import { FooterGenreBlock } from './FooterGenreBlock';

/**
 * Reader root layout. Renders:
 *   Desktop (≥1024px):  DesktopTopNav (sticky) → main → footer
 *   Mobile (<1024px):   ReaderHeader (mini, with hamburger → MobileNavDrawer) → main
 *
 * BottomTabBar removed 2026-06-08 — mobile primary nav now lives in the
 * hamburger drawer mirroring DesktopTopNav.NAV, so the two breakpoints
 * share the exact same nav surface (Đọc / Khám phá / Bảng xếp hạng / Tủ sách).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <div className="hidden lg:block">
        <DesktopTopNav />
      </div>
      <div className="lg:hidden">
        <ReaderHeader />
      </div>
      <main className="flex-1">{children}</main>
      <footer className="hidden lg:block border-t border-border py-8">
        <div className="container space-y-6">
          <FooterGenreBlock />
          <p className="text-body-sm text-fg-muted text-center">SManga · Đọc truyện chữ</p>
        </div>
      </footer>
    </div>
  );
}

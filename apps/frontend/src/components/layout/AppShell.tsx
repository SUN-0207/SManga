import { ReaderHeader } from '@/components/reader/ReaderHeader';
import type { ReactNode } from 'react';
import { DesktopTopNav } from './DesktopTopNav';
import { SiteFooter } from './SiteFooter';

/**
 * Reader root layout. Renders:
 *   Desktop (≥1024px):  DesktopTopNav (sticky) → main → SiteFooter
 *   Mobile (<1024px):   ReaderHeader (mini, with hamburger → MobileNavDrawer) → main → SiteFooter
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
      <SiteFooter />
    </div>
  );
}

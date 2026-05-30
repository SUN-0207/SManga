// apps/frontend/src/components/layout/BottomTabBar.tsx
import { Link, useRouterState } from '@tanstack/react-router';
import { BookOpen, Compass, Library, User } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Đọc', icon: BookOpen, match: (p: string) => p === '/' },
  {
    to: '/kham-pha',
    label: 'Khám phá',
    icon: Compass,
    match: (p: string) => p.startsWith('/kham-pha') || p.startsWith('/tim-kiem'),
  },
  {
    to: '/tu-sach',
    label: 'Tủ sách',
    icon: Library,
    match: (p: string) => p.startsWith('/tu-sach'),
  },
  {
    to: '/ban',
    label: 'Bạn',
    icon: User,
    match: (p: string) => p.startsWith('/ban') || p.startsWith('/tai-khoan'),
  },
] as const;

export function BottomTabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Điều hướng chính"
      className="sticky bottom-0 z-40 bg-bg/95 backdrop-blur-md border-t border-border px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2"
    >
      <ul className="grid grid-cols-4 gap-0.5" role="tablist">
        {TABS.map((tab) => {
          const active = tab.match(path);
          const Icon = tab.icon;
          return (
            <li key={tab.to} className="relative">
              <Link
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                to={tab.to as any}
                role="tab"
                aria-selected={active}
                className={`flex flex-col items-center gap-1 py-2 rounded-md transition-colors duration-fast min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active ? 'text-accent' : 'text-fg-subtle hover:text-fg-muted'
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute -top-px left-1/2 -translate-x-1/2 h-0.5 w-8 bg-accent rounded-full"
                  />
                )}
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-[10px] font-semibold leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// apps/frontend/src/components/rankings/RankTabs.tsx
import type { RankTab } from '@/api/rankings';

interface RankTabsProps {
  activeTab: RankTab;
  onTabChange: (tab: RankTab) => void;
}

interface TabDef {
  key: RankTab;
  label: string;
}

const TABS: TabDef[] = [
  { key: 'hot', label: 'Hot tuần' },
  { key: 'views', label: 'Lượt xem' },
  { key: 'rating', label: 'Rating' },
  { key: 'completed', label: 'Mới hoàn thành' },
];

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative px-4 py-3 text-body font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded cursor-pointer ${
        active ? 'text-fg' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute -bottom-px left-2 right-2 h-0.5 bg-accent-gradient rounded-full"
        />
      )}
    </button>
  );
}

export function RankTabs({ activeTab, onTabChange }: RankTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Loại bảng xếp hạng"
      className="flex gap-1 border-b border-border overflow-x-auto overflow-y-hidden"
    >
      {TABS.map((t) => (
        <TabButton key={t.key} active={activeTab === t.key} onClick={() => onTabChange(t.key)}>
          {t.label}
        </TabButton>
      ))}
    </div>
  );
}

import type { DiscoverItem } from '@/api/discover';
import { Search } from 'lucide-react';
import { DiscoverCard } from './DiscoverCard';

export function DiscoverGrid({
  items,
  isLoading,
}: {
  items: DiscoverItem[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="aspect-[3/4] rounded-lg bg-muted animate-pulse" />
            <div className="h-3 rounded bg-muted animate-pulse w-3/4" />
            <div className="h-2.5 rounded bg-muted animate-pulse w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-16">
        <Search className="h-10 w-10 text-muted-foreground/40" aria-hidden />
        <p className="font-heading text-lg">Không có kết quả</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Thử feed khác hoặc thay từ khóa tìm kiếm.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
      {items.map((it) => (
        <DiscoverCard key={it.externalUrl} item={it} />
      ))}
    </div>
  );
}

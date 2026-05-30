import { useMemo, useState } from 'react';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { me } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { bookmarksApi, type BookmarkRow } from '@/api/bookmarks';
import { readingProgressApi, type ReadingProgressRow } from '@/api/reading-progress';
import { ReadingStatsCard } from '@/components/reader/ReadingStatsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { EmptyBookshelf } from '@/components/ui/illustrations/EmptyBookshelf';
import { EmptyFolder } from '@/components/ui/illustrations/EmptyFolder';

export const Route = createFileRoute('/tu-sach')({
  beforeLoad: async () => {
    const u = await me();
    if (!u) throw redirect({ to: '/dang-nhap', search: { redirect: '/tu-sach' } });
    useAuthStore.getState().setUser(u);
  },
  component: LibraryPage,
});

type ShelfTab = 'reading' | 'saved' | 'completed';

interface ShelfItem {
  storyId: string;
  slug: string;
  title: string;
  author: string | null;
  totalChapters: number;
  chapterIndex?: number;
  progress?: number;
}

function LibraryPage() {
  const [tab, setTab] = useState<ShelfTab>('reading');
  const bookmarksQ = useQuery({ queryKey: ['me', 'bookmarks'], queryFn: () => bookmarksApi.list() });
  const progressQ = useQuery({ queryKey: ['me', 'reading-progress'], queryFn: () => readingProgressApi.list() });

  const { reading, saved, completed } = useMemo(() => {
    const progress: ReadingProgressRow[] = progressQ.data ?? [];
    const bookmarks: BookmarkRow[] = bookmarksQ.data ?? [];

    const readingItems: ShelfItem[] = [];
    const completedItems: ShelfItem[] = [];
    for (const p of progress) {
      const chapter = Number(p.chapterIndex);
      const total = p.totalChapters ?? 0;
      const isDone = total > 0 && chapter >= total;
      const item: ShelfItem = {
        storyId: p.storyId,
        slug: p.slug,
        title: p.title,
        author: p.author,
        totalChapters: total,
        chapterIndex: chapter,
        progress: total > 0 ? Math.min(100, Math.round((chapter / total) * 100)) : 0,
      };
      (isDone ? completedItems : readingItems).push(item);
    }

    const savedItems: ShelfItem[] = bookmarks.map((b) => ({
      storyId: b.storyId,
      slug: b.slug,
      title: b.title,
      author: b.author,
      totalChapters: b.totalChapters,
    }));

    return { reading: readingItems, saved: savedItems, completed: completedItems };
  }, [bookmarksQ.data, progressQ.data]);

  const counts = { reading: reading.length, saved: saved.length, completed: completed.length };
  const items = tab === 'reading' ? reading : tab === 'saved' ? saved : completed;

  return (
    <div className="container py-8 lg:py-12 space-y-8">
      <header>
        <p className="text-label text-fg-muted uppercase mb-2">CỦA BẠN</p>
        <h1 className="text-display-sm lg:text-display-md">Tủ sách</h1>
        <p className="mt-2 text-body text-fg-muted">
          Theo dõi truyện đang đọc và những truyện bạn đã đánh dấu để xem sau.
        </p>
      </header>

      <ReadingStatsCard />

      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'reading'} onClick={() => setTab('reading')}>
          Đang đọc <span className="ml-1 text-fg-subtle">({counts.reading})</span>
        </TabButton>
        <TabButton active={tab === 'saved'} onClick={() => setTab('saved')}>
          Đã lưu <span className="ml-1 text-fg-subtle">({counts.saved})</span>
        </TabButton>
        <TabButton active={tab === 'completed'} onClick={() => setTab('completed')}>
          Đã hoàn thành <span className="ml-1 text-fg-subtle">({counts.completed})</span>
        </TabButton>
      </div>

      {items.length === 0 ? (
        <EmptyShelf tab={tab} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((it) => (
            <LibraryCard key={it.storyId} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`relative px-4 py-3 text-body font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded cursor-pointer ${
        active ? 'text-fg' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
      {active && (
        <span aria-hidden className="absolute -bottom-px left-2 right-2 h-0.5 bg-accent-gradient rounded-full" />
      )}
    </button>
  );
}

function LibraryCard({ item }: { item: ShelfItem }) {
  return (
    <Link
      to="/truyen/$slug"
      params={{ slug: item.slug }}
      search={{ page: 1 }}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-bg-subtle">
        <img
          src={`/api/v1/cover/${item.storyId}`}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        {item.progress && item.progress > 0 ? (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-bg/40">
            <div className="h-full bg-accent-gradient" style={{ width: `${item.progress}%` }} />
          </div>
        ) : null}
      </div>
      <h3 className="mt-3 text-heading-md line-clamp-2">{item.title}</h3>
      <p className="mt-1 text-body-sm text-fg-muted truncate">{item.author ?? 'Khuyết danh'}</p>
    </Link>
  );
}

function EmptyShelf({ tab }: { tab: ShelfTab }) {
  if (tab === 'reading') {
    return (
      <EmptyState
        illustration={<EmptyBookshelf />}
        title="Chưa có truyện đang đọc"
        description="Mở 1 chương bất kỳ và đọc 5 giây — chúng tôi sẽ tự ghi nhớ."
        cta={{ label: 'Khám phá truyện', to: '/kham-pha', search: { q: '', page: 1 } }}
      />
    );
  }
  if (tab === 'saved') {
    return (
      <EmptyState
        illustration={<EmptyBookshelf />}
        title="Tủ sách còn trống"
        description="Đánh dấu truyện anh thích để dễ tìm lại. Bắt đầu khám phá nào."
        cta={{ label: 'Khám phá truyện', to: '/kham-pha', search: { q: '', page: 1 } }}
      />
    );
  }
  return (
    <EmptyState
      illustration={<EmptyFolder />}
      title="Chưa truyện nào hoàn tất"
      description="Đọc đến chương cuối là tự động xuất hiện ở đây."
    />
  );
}

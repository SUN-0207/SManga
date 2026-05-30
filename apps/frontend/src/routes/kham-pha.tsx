import { useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { listStories, type StorySummary } from '@/api/stories';
import { StoryCard } from '@/components/reader/StoryCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { EmptySearch } from '@/components/ui/illustrations/EmptySearch';

export const Route = createFileRoute('/kham-pha')({
  component: DiscoverPage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
    page: typeof search.page === 'number' ? search.page : 1,
    genre: typeof search.genre === 'string' ? search.genre : undefined,
  }),
});

const GENRES = [
  'Đam mỹ',
  'Xuyên không',
  'Tiên hiệp',
  'Kiếm hiệp',
  'Ngôn tình',
  'Huyền huyễn',
  'Trọng sinh',
  'Sủng',
] as const;

function DiscoverPage() {
  const { q, page, genre } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [input, setInput] = useState(q);

  // T13: listStories doesn't yet accept q/genre — wired for BE later.
  const storiesQ = useQuery({
    queryKey: ['stories', { q, genre, page, limit: 24 }],
    queryFn: () => listStories(1, 24),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    void navigate({ to: '/kham-pha', search: { q: input.trim(), page: 1, genre } });
  }

  return (
    <div className="container py-8 lg:py-12 space-y-8">
      <header>
        <p className="text-label uppercase text-fg-muted mb-2">DUYỆT</p>
        <h1 className="text-display-sm sm:text-display-md">Khám phá truyện</h1>
      </header>

      <form onSubmit={submit} role="search" aria-label="Tìm truyện" className="relative max-w-2xl">
        <Search
          aria-hidden
          className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none"
        />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tìm truyện, tác giả..."
          autoFocus
          className="w-full h-12 pl-11 pr-24 rounded-full bg-bg-elevated border border-border focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none text-body transition-colors duration-fast"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center h-9 px-5 rounded-full bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:opacity-95 transition-opacity duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Tìm
        </button>
      </form>

      <div className="flex flex-wrap gap-2" role="list" aria-label="Lọc theo thể loại">
        <Link
          to="/kham-pha"
          search={{ q, page: 1, genre: undefined }}
          role="listitem"
          className={`inline-flex items-center h-8 px-3 rounded-full text-body-sm transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            !genre
              ? 'bg-fg text-bg'
              : 'border border-border text-fg-muted hover:bg-bg-subtle hover:text-fg'
          }`}
        >
          Tất cả
        </Link>
        {GENRES.map((g) => (
          <Link
            key={g}
            to="/kham-pha"
            search={{ q, page: 1, genre: g }}
            role="listitem"
            className={`inline-flex items-center h-8 px-3 rounded-full text-body-sm transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              genre === g
                ? 'bg-fg text-bg'
                : 'border border-border text-fg-muted hover:bg-bg-subtle hover:text-fg'
            }`}
          >
            {g}
          </Link>
        ))}
      </div>

      {storiesQ.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" aria-busy="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-bg-subtle animate-pulse" />
          ))}
        </div>
      ) : storiesQ.data && storiesQ.data.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
          {storiesQ.data.map((s: StorySummary) => (
            <StoryCard
              key={s.id}
              id={s.id}
              slug={s.slug}
              title={s.title}
              author={s.author}
              status={s.status}
              totalChapters={s.totalChapters}
              hasCover={s.hasCover}
            />
          ))}
        </div>
      ) : (
        <DiscoverEmptyState
          onReset={() =>
            void navigate({ to: '/kham-pha', search: { q: '', page: 1, genre: undefined } })
          }
        />
      )}
    </div>
  );
}

function DiscoverEmptyState({ onReset }: Readonly<{ onReset: () => void }>) {
  return (
    <EmptyState
      illustration={<EmptySearch />}
      title="Không tìm thấy truyện nào khớp"
      description="Thử từ khoá khác, hoặc xoá bộ lọc để xem tất cả."
      cta={{ label: 'Xoá bộ lọc', onClick: onReset }}
    />
  );
}

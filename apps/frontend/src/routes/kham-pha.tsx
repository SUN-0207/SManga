import { listGenres } from '@/api/genres';
import { searchStories } from '@/api/search';
import { type StorySummary, getStoriesCount, listStories } from '@/api/stories';
import { StoryCard } from '@/components/reader/StoryCard';
import { SEO } from '@/components/seo/SEO';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { EmptySearch } from '@/components/ui/illustrations/EmptySearch';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';

const PAGE_SIZE = 24;

export const Route = createFileRoute('/kham-pha')({
  component: DiscoverPage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
    page: typeof search.page === 'number' ? search.page : 1,
    /** Genre slug (e.g. "xuyen-khong"), not display name. */
    genre: typeof search.genre === 'string' ? search.genre : undefined,
  }),
});

function DiscoverPage() {
  const { q, page, genre } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [input, setInput] = useState(q);
  const isSearching = q.trim().length > 0;

  const genresQ = useQuery({
    queryKey: ['genres'],
    queryFn: listGenres,
    staleTime: 30 * 60_000,
  });
  // Only render chips for genres that actually tag at least one story —
  // otherwise the UI is full of dead filters.
  const chips = (genresQ.data ?? []).filter((g) => g.storyCount > 0);

  const browseQ = useQuery({
    queryKey: ['stories', { page, genre, limit: PAGE_SIZE }],
    queryFn: () => listStories(page, PAGE_SIZE, genre),
    placeholderData: keepPreviousData,
    enabled: !isSearching,
  });

  const searchQ = useQuery({
    queryKey: ['search', { q, genre, page, limit: PAGE_SIZE }],
    queryFn: () => searchStories(q, page, genre),
    placeholderData: keepPreviousData,
    enabled: isSearching,
  });

  const countQ = useQuery({
    queryKey: ['stories', 'count', { genre }],
    queryFn: () => getStoriesCount(genre),
    staleTime: 5 * 60_000,
    enabled: !isSearching,
  });

  const items: StorySummary[] = isSearching
    ? (searchQ.data?.items ?? []).map((it) => ({
        id: it.id,
        slug: it.slug,
        title: it.title,
        author: it.author,
        status: it.status,
        totalChapters: it.totalChapters,
        hasCover: it.hasCover,
        updatedAt: it.updatedAt,
        discoveryStatus: it.discoveryStatus ?? 'complete',
        discoveryError: it.discoveryError ?? null,
        discoveredAt: it.discoveredAt ?? null,
        viewCount: it.viewCount ?? 0,
        ratingAvg: it.ratingAvg ?? null,
        ratingCount: it.ratingCount ?? 0,
        featured: it.featured ?? false,
        latestChapterIndex: null,
      }))
    : (browseQ.data ?? []);

  const activeQ = isSearching ? searchQ : browseQ;

  // Total comes from search response (window-count) when searching,
  // from /stories/count otherwise. Either way → real Trang X / Y display.
  let total = 0;
  if (isSearching) total = searchQ.data?.total ?? 0;
  else total = countQ.data ?? 0;
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;

  function submit(e: FormEvent) {
    e.preventDefault();
    void navigate({ to: '/kham-pha', search: { q: input.trim(), page: 1, genre } });
  }

  return (
    <>
      <SEO
        title="Khám phá truyện chữ | SManga"
        description="Khám phá truyện theo thể loại: ngôn tình, tiên hiệp, huyền huyễn, kiếm hiệp, đô thị, cổ đại..."
        canonical="/kham-pha"
      />
      <div className="container py-8 lg:py-12 space-y-8">
        <header>
          <p className="text-label uppercase text-fg-muted mb-2">DUYỆT</p>
          <h1 className="text-display-sm sm:text-display-md">Khám phá truyện</h1>
        </header>

        <form
          onSubmit={submit}
          role="search"
          aria-label="Tìm truyện"
          className="relative max-w-2xl"
        >
          <Search
            aria-hidden
            className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle pointer-events-none"
          />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tìm truyện, tác giả..."
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
          {chips.map((g) => (
            <Link
              key={g.slug}
              to="/kham-pha"
              search={{ q, page: 1, genre: g.slug }}
              role="listitem"
              title={`${g.name} · ${g.storyCount} truyện`}
              className={`inline-flex items-center h-8 px-3 rounded-full text-body-sm transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                genre === g.slug
                  ? 'bg-fg text-bg'
                  : 'border border-border text-fg-muted hover:bg-bg-subtle hover:text-fg'
              }`}
            >
              {g.name}
            </Link>
          ))}
        </div>

        {activeQ.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" aria-busy="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-bg-subtle animate-pulse" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
            {items.map((s) => (
              <StoryCard
                key={s.id}
                id={s.id}
                slug={s.slug}
                title={s.title}
                author={s.author}
                status={s.status}
                totalChapters={s.totalChapters}
                hasCover={s.hasCover}
                ratingAvg={s.ratingAvg}
                ratingCount={s.ratingCount}
                viewCount={s.viewCount}
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

        <Pagination
          page={page}
          totalPages={totalPages}
          isLoading={activeQ.isFetching}
          onChange={(p) => {
            void navigate({ to: '/kham-pha', search: { q, page: p, genre } });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    </>
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

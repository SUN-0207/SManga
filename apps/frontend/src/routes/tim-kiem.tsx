import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Search as SearchIcon, X } from 'lucide-react';
import { searchStories } from '@/api/search';
import { StoryCard, type StoryCardProps } from '@/components/reader/StoryCard';

export const Route = createFileRoute('/tim-kiem')({
  component: SearchPage,
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === 'string' ? s.q : '',
    page: Number(s.page) || 1,
  }),
});

function SearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [input, setInput] = useState(search.q);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', search.q, search.page],
    queryFn: () => searchStories(search.q, search.page),
    enabled: search.q.length > 0,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = input.trim();
    if (term.length === 0) {
      navigate({ search: { q: '', page: 1 } });
      return;
    }
    navigate({ search: { q: term, page: 1 } });
  }

  function clearInput() {
    setInput('');
    navigate({ search: { q: '', page: 1 } });
  }

  const items: StoryCardProps[] = (data?.items ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    author: s.author,
    status: s.status,
    totalChapters: s.totalChapters,
    hasCover: s.hasCover,
  }));

  const showResults = search.q.length > 0;
  const showZeroState = showResults && !isLoading && !isFetching && items.length === 0;
  const showGrid = showResults && items.length > 0;
  const showWelcome = !showResults;

  return (
    <div className="container py-10 sm:py-16 max-w-5xl space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground font-medium mb-2">
          Tìm kiếm
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight">
          Khám phá thư viện truyện
        </h1>
        <p className="text-muted-foreground text-sm mt-2 max-w-xl">
          Tìm theo tên truyện hoặc tác giả. Hỗ trợ gõ có dấu hoặc không dấu —{' '}
          <span className="text-foreground/80">xuyen</span> hay{' '}
          <span className="text-foreground/80">Xuyên</span> đều ra kết quả như nhau.
        </p>
      </div>

      <form
        onSubmit={submit}
        role="search"
        aria-label="Tìm truyện"
        className="relative max-w-xl"
      >
        <label htmlFor="search-input" className="sr-only">
          Từ khóa tìm kiếm
        </label>
        <SearchIcon
          aria-hidden
          className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        />
        <input
          id="search-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập tên truyện hoặc tác giả..."
          className="w-full h-12 pl-11 pr-32 rounded-full border border-border bg-background text-sm focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
        />
        {input.length > 0 && (
          <button
            type="button"
            onClick={clearInput}
            aria-label="Xóa từ khóa"
            className="absolute right-[5.25rem] top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center h-9 px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
        >
          Tìm
        </button>
      </form>

      {showWelcome && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <SearchIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Nhập từ khóa ở trên để bắt đầu tìm kiếm.
          </p>
        </div>
      )}

      {showResults && (
        <section aria-busy={isLoading || isFetching}>
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground mb-4"
          >
            {isLoading || isFetching
              ? `Đang tìm "${search.q}"...`
              : `Kết quả cho "${search.q}": ${items.length} truyện`}
          </p>

          {showGrid && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
              {items.map((s) => (
                <StoryCard key={s.id} {...s} />
              ))}
            </div>
          )}

          {showZeroState && <SearchZeroState query={search.q} />}
        </section>
      )}
    </div>
  );
}

function SearchZeroState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-12">
      <BookOpen className="h-10 w-10 text-muted-foreground/40" aria-hidden />
      <p className="font-heading text-lg">
        Không tìm thấy truyện nào khớp với "{query}"
      </p>
      <p className="text-sm text-muted-foreground max-w-md">
        Thử từ khóa khác, hoặc bỏ dấu tiếng Việt. Tìm kiếm hiện chỉ dò tên truyện và tác giả — chưa hỗ trợ lọc theo thể loại.
      </p>
      <Link
        to="/"
        className="mt-2 inline-flex items-center gap-1.5 text-sm hover:underline underline-offset-4 cursor-pointer"
      >
        ← Quay về trang chủ
      </Link>
    </div>
  );
}

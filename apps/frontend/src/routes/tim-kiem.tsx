import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon } from 'lucide-react';
import { searchStories } from '@/api/search';
import { StoryGrid } from '@/components/reader/StoryGrid';

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
    if (term.length === 0) return;
    navigate({ search: { q: term, page: 1 } });
  }

  const items = (data?.items ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    author: s.author,
    status: s.status,
    totalChapters: s.totalChapters,
    hasCover: s.hasCover,
  }));

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
          Hỗ trợ tìm có dấu hoặc không dấu — gõ <em>"tien hiep"</em> sẽ ra <em>"Tiên Hiệp"</em>.
        </p>
      </div>

      <form onSubmit={submit} className="relative max-w-xl">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập tên truyện hoặc tác giả..."
          aria-label="Từ khóa tìm kiếm"
          className="w-full h-12 pl-11 pr-28 rounded-full border border-border bg-background text-sm focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center h-9 px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
        >
          Tìm
        </button>
      </form>

      {search.q && (
        <div className="space-y-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-muted-foreground">
              {isLoading || isFetching
                ? 'Đang tìm...'
                : `Kết quả cho "${search.q}": ${items.length} truyện`}
            </p>
          </div>
          <StoryGrid stories={items} />
        </div>
      )}
    </div>
  );
}

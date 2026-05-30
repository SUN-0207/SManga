import { useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { CatalogFeed } from '@/api/discover';

export function DiscoverFilters({
  feeds,
  activeFeed,
  query,
  supportsSearch,
  onFeedChange,
  onQueryChange,
}: {
  feeds: CatalogFeed[];
  activeFeed: string | null;
  query: string;
  supportsSearch: boolean;
  onFeedChange: (feedId: string) => void;
  onQueryChange: (q: string) => void;
}) {
  const [input, setInput] = useState(query);
  const searching = query.length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    onQueryChange(input.trim());
  }

  function clear() {
    setInput('');
    onQueryChange('');
  }

  return (
    <div className="sticky top-14 sm:top-16 z-10 bg-background/95 backdrop-blur-md border-b border-border/60 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 space-y-3">
      {/* Sticks just under the admin top bar (h-14 mobile / h-16 sm+).
          admin/route.tsx makes that top bar sticky too so they stack cleanly. */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {feeds.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFeedChange(f.id)}
            disabled={searching}
            className={
              !searching && activeFeed === f.id
                ? 'inline-flex items-center h-8 px-3 rounded-full text-sm font-medium bg-foreground text-background transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 whitespace-nowrap'
                : 'inline-flex items-center h-8 px-3 rounded-full text-sm border border-border hover:border-foreground/40 hover:bg-muted/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed'
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {supportsSearch && (
        <form onSubmit={submit} role="search" aria-label="Tìm trên nguồn" className="relative max-w-md">
          <label htmlFor="discover-search" className="sr-only">
            Từ khóa tìm kiếm
          </label>
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
          />
          <input
            id="discover-search"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tìm tên truyện trên nguồn..."
            className="w-full h-9 pl-9 pr-20 rounded-full border border-border bg-background text-sm focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
          />
          {input.length > 0 && (
            <button
              type="button"
              onClick={clear}
              aria-label="Xóa tìm kiếm"
              className="absolute right-12 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="submit"
            className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center h-7 px-3 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            Tìm
          </button>
        </form>
      )}
    </div>
  );
}

import { ChapterGrid } from '@/components/reader/ChapterGrid';
import { ClientPagination } from '@/components/reader/ClientPagination';
import { type ChapterListItem, type ChapterSort, filterSortChapters } from '@/lib/chapter-filter';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

const PAGE_SIZE = 50;

export interface ChapterBrowserProps {
  slug: string;
  chapters: ChapterListItem[];
  readUpToIndex: number | null;
  isAuthenticated: boolean;
}

const pill =
  'inline-flex items-center h-9 px-4 rounded-full text-sm border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const pillActive = 'border-fg bg-fg text-bg';
const pillInactive = 'border-border text-fg-muted hover:border-fg/40 hover:bg-bg-subtle';

export function ChapterBrowser({
  slug,
  chapters,
  readUpToIndex,
  isAuthenticated,
}: ChapterBrowserProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ChapterSort>('oldest');
  const [filterRead, setFilterRead] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => filterSortChapters(chapters, { query, sort, readUpToIndex, filterRead }),
    [chapters, query, sort, readUpToIndex, filterRead],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function setSortAndReset(next: ChapterSort) {
    setSort(next);
    setFilterRead(false);
    setPage(1);
  }
  function toggleReadAndReset() {
    setFilterRead((v) => !v);
    setPage(1);
  }
  function setQueryAndReset(next: string) {
    setQuery(next);
    setPage(1);
  }

  const sortActive = (s: ChapterSort) => sort === s && !filterRead;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQueryAndReset(e.target.value)}
            placeholder="Tìm chương..."
            aria-label="Tìm chương"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-bg text-sm placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors duration-200"
          />
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Sắp xếp và lọc chương">
          <button
            type="button"
            onClick={() => setSortAndReset('newest')}
            aria-pressed={sortActive('newest')}
            className={`${pill} ${sortActive('newest') ? pillActive : pillInactive}`}
          >
            Mới nhất
          </button>
          <button
            type="button"
            onClick={() => setSortAndReset('oldest')}
            aria-pressed={sortActive('oldest')}
            className={`${pill} ${sortActive('oldest') ? pillActive : pillInactive}`}
          >
            Cũ nhất
          </button>
          {isAuthenticated && (
            <button
              type="button"
              onClick={toggleReadAndReset}
              aria-pressed={filterRead}
              className={`${pill} ${filterRead ? pillActive : pillInactive}`}
            >
              Đã đọc
            </button>
          )}
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-fg-muted">
          Trang {safePage} / {totalPages} · {filtered.length} chương
        </p>
      )}

      {pageItems.length > 0 ? (
        <ChapterGrid slug={slug} chapters={pageItems} readUpToIndex={readUpToIndex} />
      ) : (
        <p className="text-center text-sm text-fg-muted py-12">
          {filterRead ? 'Bạn chưa đọc chương nào.' : 'Không tìm thấy chương nào.'}
        </p>
      )}

      {totalPages > 1 && (
        <ClientPagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}

import { listStories } from '@/api/stories';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Search as SearchIcon, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SearchResultRow } from './SearchResultRow';

const RESULT_CAP = 8;
const DEBOUNCE_MS = 200;

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Reader-facing instant search overlay. Owns its own input state and a
 * debounced query that hits the public GET /stories endpoint with q=.
 *
 *  - input empty → no fetch, empty list
 *  - typing → debounced 200 ms → top 8 stories show
 *  - ↑↓ moves a visual highlight; Enter opens the highlighted row or, if
 *    nothing is highlighted, navigates to /kham-pha?q=<input>
 *  - Esc / backdrop click / X button → close
 *  - mobile (<sm) → fullscreen sheet; desktop → centered panel
 */
export function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [input, setInput] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const debounced = useDebouncedValue(input.trim(), DEBOUNCE_MS);

  // Reset state every time the modal opens — stale input from a previous
  // session feels broken. Focus the input after the open transition starts.
  useEffect(() => {
    if (!open) return;
    setInput('');
    setActiveIndex(-1);
    // rAF so the input is actually mounted + visible before we steal focus.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Body scroll-lock while open — matches MobileNavDrawer convention.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close. Listening on window so it fires even if focus has
  // drifted (e.g., user tabbed onto the backdrop button).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // We ask for cap+1 so we can show "Xem tất cả" iff there are strictly
  // more matches than we render. Disabled when the query is empty (avoids
  // hammering the API on every modal open).
  const searchQ = useQuery({
    queryKey: ['search-modal', debounced],
    // listStories(page, limit, genre, featured, discoveryStatus, author, q)
    queryFn: () =>
      listStories(1, RESULT_CAP + 1, undefined, undefined, undefined, undefined, debounced),
    enabled: open && debounced.length > 0,
    staleTime: 30_000,
  });

  const items = useMemo(() => (searchQ.data ?? []).slice(0, RESULT_CAP), [searchQ.data]);
  const hasMore = (searchQ.data?.length ?? 0) > RESULT_CAP;

  // Clamp activeIndex whenever the result list shrinks so a stale index
  // doesn't point past the end.
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, items.length);
    if (activeIndex >= items.length) setActiveIndex(items.length - 1);
  }, [items.length, activeIndex]);

  // Keep the highlighted row visible when arrowing through a long list.
  useEffect(() => {
    if (activeIndex < 0) return;
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function goToStory(slug: string) {
    onClose();
    void navigate({
      to: '/truyen/$slug',
      params: { slug },
      search: { page: 1, commentsPage: 1 },
    });
  }

  function goToDiscover() {
    onClose();
    void navigate({ to: '/kham-pha', search: { q: debounced, page: 1, genre: undefined } });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (items.length === 0) return;
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      if (items.length === 0) return;
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const picked = activeIndex >= 0 ? items[activeIndex] : undefined;
      if (picked) {
        goToStory(picked.slug);
        return;
      }
      if (debounced.length > 0) goToDiscover();
    }
  }

  if (!open) return null;

  const showLoading = searchQ.isFetching && debounced.length > 0 && items.length === 0;
  const showEmpty = !searchQ.isFetching && debounced.length > 0 && items.length === 0;
  const showInitial = debounced.length === 0;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center sm:pt-24"
    >
      {/* Backdrop — click closes. Real <button> for a11y. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng tìm kiếm"
        className="absolute inset-0 bg-fg/40 backdrop-blur-sm"
      />

      {/* Panel — fullscreen on mobile, centered sheet on sm+. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tìm truyện"
        className="relative w-full h-[100dvh] sm:h-auto sm:max-h-[80vh] sm:w-full sm:max-w-xl bg-bg-elevated sm:rounded-2xl border border-border shadow-elev flex flex-col overflow-hidden"
      >
        {/* Input row */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <SearchIcon className="h-4 w-4 text-fg-muted flex-shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder="Tìm truyện hoặc tác giả..."
            aria-label="Tìm truyện"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-row-${activeIndex}` : undefined}
            className="flex-1 bg-transparent text-body text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results — tabIndex=-1 so the listbox itself is focusable per a11y
            spec (we keep DOM focus on the input via aria-activedescendant,
            but the role demands the host element be reachable). */}
        <div
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label="Kết quả tìm kiếm"
          className="flex-1 overflow-y-auto focus:outline-none"
        >
          {showInitial && (
            <p className="px-4 py-6 text-body-sm text-fg-muted">
              Nhập từ khóa để bắt đầu tìm truyện.
            </p>
          )}
          {showLoading && <p className="px-4 py-6 text-body-sm text-fg-muted">Đang tìm...</p>}
          {showEmpty && (
            <p className="px-4 py-6 text-body-sm text-fg-muted">
              Không tìm thấy. Thử từ khóa khác.
            </p>
          )}
          {items.length > 0 &&
            items.map((it, i) => (
              <div key={it.id} id={`${listboxId}-row-${i}`}>
                <SearchResultRow
                  item={{
                    id: it.id,
                    slug: it.slug,
                    title: it.title,
                    author: it.author,
                    totalChapters: it.totalChapters,
                    hasCover: it.hasCover,
                  }}
                  isActive={i === activeIndex}
                  onSelect={() => goToStory(it.slug)}
                  registerRef={(el) => {
                    rowRefs.current[i] = el;
                  }}
                />
              </div>
            ))}
        </div>

        {/* Footer: "see all" navigates to /kham-pha?q=... when results
            saturate the cap OR when there's any result and the user just
            wants the full list. We only render this when there's something
            useful to "see all" of. */}
        {items.length > 0 && hasMore && (
          <button
            type="button"
            onClick={goToDiscover}
            className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-body-sm font-semibold text-accent hover:bg-bg-subtle transition-colors duration-fast cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="truncate">Xem tất cả kết quả cho "{debounced}"</span>
            <ArrowRight className="h-4 w-4 flex-shrink-0" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

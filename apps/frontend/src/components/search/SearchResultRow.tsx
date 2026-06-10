import { StoryCover } from '@/components/ui/StoryCover';

export interface SearchResultRowItem {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  totalChapters: number;
  hasCover: boolean;
}

interface SearchResultRowProps {
  item: SearchResultRowItem;
  isActive: boolean;
  onSelect: () => void;
  /** Used to keep the active row scrolled into view when navigating with ↑↓. */
  registerRef: (el: HTMLButtonElement | null) => void;
}

/**
 * Single result row in the search modal. Renders a 40×56 cover thumb, the
 * story title, and an author + chapter-count subtitle. Active state mirrors
 * hover so keyboard and mouse converge on the same affordance.
 */
export function SearchResultRow({ item, isActive, onSelect, registerRef }: SearchResultRowProps) {
  return (
    <button
      ref={registerRef}
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast cursor-pointer focus-visible:outline-none ${
        isActive ? 'bg-bg-subtle' : 'hover:bg-bg-subtle'
      }`}
    >
      <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded-md bg-bg-subtle">
        <StoryCover
          storyId={item.id}
          title={item.title}
          hasCover={item.hasCover}
          decorative
          loading="lazy"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body font-semibold text-fg truncate">{item.title}</p>
        <p className="text-body-sm text-fg-muted truncate">
          {item.author ?? 'Khuyết danh'}
          {item.totalChapters > 0 ? ` · ${item.totalChapters} chương` : ''}
        </p>
      </div>
    </button>
  );
}

import type { DiscoverItem } from '@/api/discover';
import { useDiscoverImportStore } from '@/stores/discover-import-store';
import { BookText, Check, Loader2 } from 'lucide-react';
import { StubBadge } from './StubBadge';

const STATUS_TONE: Record<string, string> = {
  Full: 'bg-foreground text-background',
  Hot: 'bg-[hsl(var(--color-cta))] text-white',
  Mới: 'bg-blue-500 text-white',
};

export function DiscoverCard({ item }: { item: DiscoverItem }) {
  const selected = useDiscoverImportStore((s) => s.selected.has(item.externalUrl));
  const importing = useDiscoverImportStore((s) => s.importing.has(item.externalUrl));
  const toggle = useDiscoverImportStore((s) => s.toggle);

  const alreadyImported = item.existingStoryId !== null;
  const disabled = alreadyImported || importing;

  // Six mutex visual states ordered by precedence
  const state:
    | 'imported_full'
    | 'imported_stub'
    | 'importing'
    | 'selected'
    | 'discoverable'
    | 'error' = importing
    ? 'importing'
    : alreadyImported && item.existingDiscoveryStatus === 'complete'
      ? 'imported_full'
      : alreadyImported && item.existingDiscoveryStatus === 'failed'
        ? 'error'
        : alreadyImported
          ? 'imported_stub'
          : selected
            ? 'selected'
            : 'discoverable';

  const ringClass =
    state === 'selected'
      ? 'ring-2 ring-[hsl(var(--color-cta))] ring-offset-2'
      : state === 'importing'
        ? 'ring-2 ring-blue-500 ring-offset-2'
        : alreadyImported
          ? 'opacity-60'
          : '';

  function onClick() {
    if (disabled) return;
    toggle(item.externalUrl);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${item.title} của ${item.author ?? 'Khuyết danh'}${
        alreadyImported ? ' (đã import)' : ''
      }`}
      className={`group relative flex flex-col gap-2 text-left rounded-xl bg-background transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed ${ringClass}`}
    >
      {/* Cover */}
      <div className="relative aspect-[3/4] bg-muted overflow-hidden rounded-lg shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] transition-shadow duration-200 group-hover:shadow-[0_16px_32px_-12px_rgba(0,0,0,0.25)]">
        {item.coverThumbUrl ? (
          <img
            src={item.coverThumbUrl}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
            <BookText className="h-8 w-8" aria-hidden />
          </div>
        )}

        {/* Selection check overlay */}
        {selected && !disabled && (
          <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-[hsl(var(--color-cta))] text-white flex items-center justify-center shadow-md">
            <Check className="h-3.5 w-3.5" aria-hidden />
          </div>
        )}

        {/* Importing spinner overlay */}
        {state === 'importing' && (
          <div className="absolute inset-0 bg-blue-500/15 backdrop-blur-[1px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-blue-700 animate-spin" aria-hidden />
          </div>
        )}

        {/* Source status pill (top-left) */}
        {item.statusLabel && (
          <span
            className={`absolute top-1.5 left-1.5 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium ${
              STATUS_TONE[item.statusLabel] ?? 'bg-muted text-foreground'
            }`}
          >
            {item.statusLabel}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="px-1 space-y-0.5">
        <h3 className="font-heading font-semibold text-[13px] leading-snug line-clamp-2 tracking-tight">
          {item.title}
        </h3>
        <p className="text-[11px] text-muted-foreground line-clamp-1">
          {item.author ?? 'Khuyết danh'}
        </p>
        <div className="flex items-center justify-between gap-1 pt-0.5">
          {item.totalChaptersHint !== null && (
            <span className="text-[10px] text-muted-foreground/80">
              {item.totalChaptersHint} chương
            </span>
          )}
          {alreadyImported && item.existingDiscoveryStatus && (
            <StubBadge status={item.existingDiscoveryStatus} />
          )}
        </div>
      </div>
    </button>
  );
}

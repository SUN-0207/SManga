import { useMemo } from 'react';
import { BookText, Check, ExternalLink, Loader2 } from 'lucide-react';
import type { DiscoverItem } from '@/api/discover';
import { useDiscoverImportStore } from '@/stores/discover-import-store';
import { StubBadge } from './StubBadge';

const STATUS_TONE: Record<string, string> = {
  Full: 'bg-foreground text-background',
  Hot: 'bg-[hsl(var(--color-cta))] text-white',
  'Mới': 'bg-blue-500 text-white',
};

export function DiscoverTable({
  items,
  isLoading,
}: {
  items: DiscoverItem[];
  isLoading: boolean;
}) {
  const selected = useDiscoverImportStore((s) => s.selected);
  const toggle = useDiscoverImportStore((s) => s.toggle);
  const importing = useDiscoverImportStore((s) => s.importing);
  const selectAll = useDiscoverImportStore((s) => s.selectAll);
  const clearSelection = useDiscoverImportStore((s) => s.clearSelection);

  // Selectable URLs = visible items that aren't already imported and aren't in-flight.
  const selectableUrls = useMemo(
    () =>
      items
        .filter((it) => it.existingStoryId === null && !importing.has(it.externalUrl))
        .map((it) => it.externalUrl),
    [items, importing],
  );

  const allVisibleSelected =
    selectableUrls.length > 0 && selectableUrls.every((u) => selected.has(u));
  const someVisibleSelected =
    selectableUrls.some((u) => selected.has(u)) && !allVisibleSelected;

  function onHeaderToggle() {
    if (allVisibleSelected) {
      // Deselect visible only — keep selections from other pages intact
      const next = new Set(selected);
      for (const u of selectableUrls) next.delete(u);
      // useDiscoverImportStore exposes selectAll/clearSelection; combine
      if (next.size === 0) clearSelection();
      else selectAll([...next]);
    } else {
      // Add all visible-selectable to current selection
      selectAll([...new Set([...selected, ...selectableUrls])]);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          Đang tải catalog...
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="px-5 py-12 text-center">
          <p className="font-heading text-lg mb-1">Không có kết quả</p>
          <p className="text-sm text-muted-foreground">
            Thử feed khác hoặc thay từ khóa tìm kiếm.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="border-b border-border text-left">
              <th className="w-10 px-4 py-2.5">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  onChange={onHeaderToggle}
                  disabled={selectableUrls.length === 0}
                  aria-label="Chọn tất cả trên trang này"
                />
              </th>
              <th className="w-14 px-2 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Bìa
              </th>
              <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Tiêu đề
              </th>
              <th className="px-3 py-2.5 w-44 text-[11px] uppercase tracking-wider font-medium text-muted-foreground hidden md:table-cell">
                Tác giả
              </th>
              <th className="px-3 py-2.5 w-20 text-[11px] uppercase tracking-wider font-medium text-muted-foreground hidden sm:table-cell">
                Nhãn
              </th>
              <th className="px-3 py-2.5 w-24 text-[11px] uppercase tracking-wider font-medium text-muted-foreground tabular-nums hidden sm:table-cell">
                Chương
              </th>
              <th className="px-3 py-2.5 w-36 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Trạng thái
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <Row key={it.externalUrl} item={it} selected={selected.has(it.externalUrl)} importing={importing.has(it.externalUrl)} onToggle={() => toggle(it.externalUrl)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  item,
  selected,
  importing,
  onToggle,
}: {
  item: DiscoverItem;
  selected: boolean;
  importing: boolean;
  onToggle: () => void;
}) {
  const alreadyImported = item.existingStoryId !== null;
  const disabled = alreadyImported || importing;

  return (
    <tr
      onClick={() => !disabled && onToggle()}
      aria-disabled={disabled}
      className={`border-b border-border/60 last:border-0 transition-colors duration-150 ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : selected
            ? 'bg-[hsl(var(--color-cta))]/5 cursor-pointer'
            : 'hover:bg-muted/30 cursor-pointer'
      }`}
    >
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          aria-label={`Chọn ${item.title}`}
        />
      </td>
      <td className="px-2 py-2">
        <div className="relative h-14 w-10 rounded overflow-hidden bg-muted shrink-0">
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
              <BookText className="h-4 w-4" aria-hidden />
            </div>
          )}
          {importing && (
            <div className="absolute inset-0 bg-blue-500/15 flex items-center justify-center">
              <Loader2 className="h-3 w-3 text-blue-700 animate-spin" aria-hidden />
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="font-medium text-sm leading-snug line-clamp-2">{item.title}</div>
        <a
          href={item.externalUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer mt-0.5"
        >
          <ExternalLink className="h-2.5 w-2.5" aria-hidden />
          mở trên nguồn
        </a>
        <div className="md:hidden text-[11px] text-muted-foreground mt-1">
          {item.author ?? 'Khuyết danh'}
          {item.totalChaptersHint !== null && ` · ${item.totalChaptersHint} chương`}
        </div>
      </td>
      <td className="px-3 py-2 text-sm text-muted-foreground hidden md:table-cell">
        {item.author ?? '—'}
      </td>
      <td className="px-3 py-2 hidden sm:table-cell">
        {item.statusLabel && (
          <span
            className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium ${
              STATUS_TONE[item.statusLabel] ?? 'bg-muted text-foreground'
            }`}
          >
            {item.statusLabel}
          </span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-sm hidden sm:table-cell">
        {item.totalChaptersHint ?? '—'}
      </td>
      <td className="px-3 py-2">
        {alreadyImported && item.existingDiscoveryStatus ? (
          <StubBadge status={item.existingDiscoveryStatus} />
        ) : selected ? (
          <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--color-cta))] font-medium">
            <Check className="h-3 w-3" aria-hidden />
            Đã chọn
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2" />
    </tr>
  );
}

function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  ...rest
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  'aria-label': string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate ?? false;
      }}
      className="h-4 w-4 rounded border-border text-[hsl(var(--color-cta))] focus-visible:ring-2 focus-visible:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      {...rest}
    />
  );
}

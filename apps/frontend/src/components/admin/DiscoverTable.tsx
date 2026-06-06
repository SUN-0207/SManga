import type { DiscoverItem } from '@/api/discover';
import { useDiscoverImportStore } from '@/stores/discover-import-store';
import { BookText, Check, ExternalLink, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { StubBadge } from './StubBadge';

const STATUS_TONE: Record<string, string> = {
  completed: 'bg-positive/15 text-positive border-positive/30',
  ongoing: 'bg-accent/15 text-accent border-accent/30',
  dropped: 'bg-bg-subtle text-fg-muted border-border',
  unknown: 'bg-bg-subtle text-fg-muted border-border',
  // Legacy labels from external sources
  Full: 'bg-fg text-bg',
  Hot: 'bg-accent/15 text-accent border-accent/30',
  Mới: 'bg-accent/15 text-accent border-accent/30',
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
  const someVisibleSelected = selectableUrls.some((u) => selected.has(u)) && !allVisibleSelected;

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
      <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
        <div className="px-5 py-8 text-center text-body-sm text-fg-muted">Đang tải catalog...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
        <div className="px-5 py-12 text-center">
          <p className="font-sans text-heading-md text-fg mb-1">Không có kết quả</p>
          <p className="text-body-sm text-fg-muted">Thử feed khác hoặc thay từ khóa tìm kiếm.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="sticky top-0 z-10 bg-bg/95 backdrop-blur">
            <tr className="border-b border-border">
              <th className="w-10 px-4 py-2.5">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  onChange={onHeaderToggle}
                  disabled={selectableUrls.length === 0}
                  aria-label="Chọn tất cả trên trang này"
                />
              </th>
              <th className="w-14 px-2 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                Bìa
              </th>
              <th className="px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                Tiêu đề
              </th>
              <th className="px-3 py-2.5 w-44 text-[11px] uppercase tracking-wider font-medium text-fg-muted hidden md:table-cell">
                Tác giả
              </th>
              <th className="px-3 py-2.5 w-20 text-[11px] uppercase tracking-wider font-medium text-fg-muted hidden sm:table-cell">
                Nhãn
              </th>
              <th className="px-3 py-2.5 w-24 text-[11px] uppercase tracking-wider font-medium text-fg-muted tabular-nums hidden sm:table-cell">
                Chương
              </th>
              <th className="px-3 py-2.5 w-36 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                Trạng thái
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <Row
                key={it.externalUrl}
                item={it}
                selected={selected.has(it.externalUrl)}
                importing={importing.has(it.externalUrl)}
                onToggle={() => toggle(it.externalUrl)}
              />
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
      className={`border-b border-border/60 transition-colors duration-fast last:border-0 ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : selected
            ? 'border-l-2 border-l-accent bg-bg-subtle cursor-pointer'
            : 'hover:bg-bg-subtle/60 cursor-pointer'
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
        <div className="relative h-14 w-10 rounded overflow-hidden bg-bg-subtle shrink-0">
          {item.coverThumbUrl ? (
            <img
              src={item.coverThumbUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fg-subtle">
              <BookText className="h-4 w-4" aria-hidden />
            </div>
          )}
          {importing && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full border border-accent/30 bg-accent/15">
              <Loader2 className="h-3 w-3 text-accent animate-spin" aria-hidden />
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="font-medium text-body-sm text-fg leading-snug line-clamp-2">
          {item.title}
        </div>
        <a
          href={item.externalUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg transition-colors duration-fast cursor-pointer mt-0.5"
        >
          <ExternalLink className="h-2.5 w-2.5" aria-hidden />
          mở trên nguồn
        </a>
        <div className="md:hidden text-[11px] text-fg-muted mt-1">
          {item.author ?? 'Khuyết danh'}
          {item.totalChaptersHint !== null && ` · ${item.totalChaptersHint} chương`}
        </div>
      </td>
      <td className="px-3 py-2 text-body-sm text-fg-muted hidden md:table-cell">
        {item.author ?? '—'}
      </td>
      <td className="px-3 py-2 hidden sm:table-cell">
        {item.statusLabel && (
          <span
            className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium border ${
              STATUS_TONE[item.statusLabel] ?? 'bg-bg-subtle text-fg-muted border-border'
            }`}
          >
            {item.statusLabel}
          </span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-body-sm text-fg hidden sm:table-cell">
        {item.totalChaptersHint ?? '—'}
      </td>
      <td className="px-3 py-2">
        {alreadyImported && item.existingDiscoveryStatus ? (
          <StubBadge status={item.existingDiscoveryStatus} />
        ) : importing ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
            <Loader2 className="h-3 w-3 animate-spin" />
            Đang import
          </span>
        ) : selected ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-accent font-medium">
            <Check className="h-3 w-3" aria-hidden />
            Đã chọn
          </span>
        ) : (
          <span className="text-[11px] text-fg-muted">—</span>
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
      className="h-4 w-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      {...rest}
    />
  );
}

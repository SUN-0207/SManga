import {
  type AdminReport,
  type ReportCategory,
  type ReportStatus,
  getAdminReports,
  updateReport,
} from '@/api/reports';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/admin/reports')({
  component: AdminReportsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === 'number' ? search.page : Number(search.page) || 1,
    status: typeof search.status === 'string' ? (search.status as ReportStatus | 'all') : 'all',
    category:
      typeof search.category === 'string' ? (search.category as ReportCategory | 'all') : 'all',
  }),
});

const LIMIT = 20;

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Mở',
  in_progress: 'Đang xử lý',
  resolved: 'Đã xử lý',
  dismissed: 'Bỏ qua',
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  open: 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  in_progress:
    'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  resolved:
    'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  dismissed: 'bg-bg-subtle text-fg-muted border border-border',
};

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  content: 'Nội dung',
  comment: 'Bình luận',
  technical: 'Kỹ thuật',
  other: 'Khác',
};

const CATEGORY_COLORS: Record<ReportCategory, string> = {
  content:
    'bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  comment:
    'bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  technical:
    'bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  other: 'bg-bg-subtle text-fg-muted border border-border',
};

function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function CategoryChip({ category }: { category: ReportCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[category]}`}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function AdminReportsPage() {
  const { page, status, category } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const effectiveStatus = status === 'all' ? undefined : status;
  const effectiveCategory = category === 'all' ? undefined : category;

  const reportsQ = useQuery({
    queryKey: ['admin', 'reports', { status, category, page }],
    queryFn: () =>
      getAdminReports({
        status: effectiveStatus,
        category: effectiveCategory,
        page,
        limit: LIMIT,
      }),
    retry: false,
  });

  const data = reportsQ.data;
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  useEffect(() => {
    if (data && data.total > 0 && totalPages >= 1 && page > totalPages) {
      void navigate({ search: { status, category, page: totalPages } });
    }
  }, [data, totalPages, page, status, category, navigate]);

  function setFilter(
    updates: Partial<{ status: ReportStatus | 'all'; category: ReportCategory | 'all' }>,
  ) {
    void navigate({ search: { page: 1, status, category, ...updates } });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-fg-muted font-medium mb-2">
            Quản trị
          </p>
          <h1 className="font-sans font-bold text-3xl sm:text-4xl tracking-tight text-fg">
            Báo lỗi
          </h1>
          <p className="text-body-sm text-fg-muted mt-2">
            Phản hồi từ người đọc — lọc, xem chi tiết và cập nhật trạng thái.
          </p>
        </div>
        {data && (
          <div className="text-body-sm text-fg-muted tabular-nums">
            <span className="font-medium text-fg">{data.total.toLocaleString('vi-VN')}</span> báo
            cáo
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.2em] text-fg-muted font-medium">
            Trạng thái
          </span>
          <select
            value={status}
            onChange={(e) => setFilter({ status: e.target.value as ReportStatus | 'all' })}
            className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-body-sm text-fg transition-colors duration-fast hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            <option value="all">Tất cả</option>
            {(Object.keys(STATUS_LABELS) as ReportStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.2em] text-fg-muted font-medium">
            Loại
          </span>
          <select
            value={category}
            onChange={(e) => setFilter({ category: e.target.value as ReportCategory | 'all' })}
            className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-body-sm text-fg transition-colors duration-fast hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
          >
            <option value="all">Tất cả</option>
            {(Object.keys(CATEGORY_LABELS) as ReportCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
        {reportsQ.isLoading ? (
          <p className="text-body-sm text-fg-muted p-8 text-center">Đang tải...</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-body-sm text-fg-muted p-8 text-center">
            Không có báo cáo nào phù hợp bộ lọc.
          </p>
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="sticky top-0 z-10 bg-bg/95 backdrop-blur">
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-fg-muted w-36">
                  Thời gian
                </th>
                <th className="px-3 py-3 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                  Người gửi
                </th>
                <th className="px-3 py-3 text-[11px] uppercase tracking-wider font-medium text-fg-muted w-28">
                  Loại
                </th>
                <th className="px-3 py-3 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                  Nội dung
                </th>
                <th className="px-3 py-3 text-[11px] uppercase tracking-wider font-medium text-fg-muted w-32">
                  Ngữ cảnh
                </th>
                <th className="px-3 py-3 text-[11px] uppercase tracking-wider font-medium text-fg-muted w-28">
                  Trạng thái
                </th>
                <th className="px-4 py-3 w-48 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  onUpdated={() => {
                    void qc.invalidateQueries({ queryKey: ['admin', 'reports'] });
                  }}
                />
              ))}
            </tbody>
          </table>
        )}

        {data && totalPages > 1 && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-between text-[11px]">
            <span className="text-fg-muted">
              Trang {data.page} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  void navigate({ search: { status, category, page: Math.max(1, page - 1) } })
                }
                disabled={page === 1}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg px-3 text-body-sm font-medium text-fg transition-colors duration-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Trước
              </button>
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    search: { status, category, page: Math.min(totalPages, page + 1) },
                  })
                }
                disabled={page >= totalPages}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg px-3 text-body-sm font-medium text-fg transition-colors duration-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sau
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportRow({
  report,
  onUpdated,
}: {
  report: AdminReport;
  onUpdated: () => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState<ReportStatus>(report.status);
  const [adminNote, setAdminNote] = useState(report.adminNote ?? '');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setSelectedStatus(report.status);
    setAdminNote(report.adminNote ?? '');
  }, [report.status, report.adminNote]);

  const updateM = useMutation({
    mutationFn: () =>
      updateReport(report.id, {
        status: selectedStatus,
        adminNote: adminNote.trim(),
      }),
    onSuccess: () => {
      onUpdated();
    },
  });

  const contextHref =
    report.storySlug && report.chapterIndex != null
      ? `/truyen/${report.storySlug}/chuong/${report.chapterIndex}`
      : report.storySlug
        ? `/truyen/${report.storySlug}`
        : null;

  const dirty = selectedStatus !== report.status || adminNote.trim() !== (report.adminNote ?? '');

  const errMsg = updateM.error as { response?: { data?: { message?: string } } } | null;
  const errorText = errMsg?.response?.data?.message ?? null;

  return (
    <>
      <tr className="border-b border-border last:border-0 transition-colors duration-fast hover:bg-bg-subtle/60">
        <td className="px-4 py-3 text-[11px] text-fg-muted tabular-nums whitespace-nowrap">
          {new Date(report.createdAt).toLocaleString('vi-VN')}
        </td>
        <td className="px-3 py-3 min-w-0">
          {report.reporterName || report.reporterEmail ? (
            <>
              <div className="font-medium text-fg truncate max-w-[140px]">
                {report.reporterName ?? '(ẩn danh)'}
              </div>
              {report.reporterEmail && (
                <div className="text-[11px] text-fg-muted truncate max-w-[140px]">
                  {report.reporterEmail}
                </div>
              )}
            </>
          ) : (
            <span className="text-[11px] text-fg-subtle">Khách</span>
          )}
        </td>
        <td className="px-3 py-3">
          <CategoryChip category={report.category} />
        </td>
        <td className="px-3 py-3 max-w-xs">
          <p className="line-clamp-2 text-fg">{report.message}</p>
        </td>
        <td className="px-3 py-3">
          {contextHref ? (
            <Link
              to={contextHref as '/'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              {report.chapterIndex != null
                ? `Ch.${report.chapterIndex}`
                : (report.storyTitle ?? 'Xem')}
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </Link>
          ) : (
            <span className="text-[11px] text-fg-subtle">—</span>
          )}
        </td>
        <td className="px-3 py-3">
          <StatusBadge status={report.status} />
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex h-8 items-center rounded-md border border-border bg-bg px-3 text-[11px] font-medium text-fg-muted transition-colors duration-fast hover:border-border-strong hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            {expanded ? 'Thu gọn' : 'Xử lý'}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border last:border-0 bg-bg-subtle/30">
          <td colSpan={7} className="px-4 py-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-[240px] space-y-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-fg-muted font-medium">
                  Nội dung đầy đủ
                </p>
                <p className="text-body-sm text-fg whitespace-pre-wrap">{report.message}</p>
                {report.adminNote && selectedStatus === report.status && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-fg-muted font-medium mb-1">
                      Ghi chú hiện tại
                    </p>
                    <p className="text-body-sm text-fg-muted italic">{report.adminNote}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 min-w-[280px]">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`status-${report.id}`}
                    className="text-[11px] uppercase tracking-[0.2em] text-fg-muted font-medium"
                  >
                    Đổi trạng thái
                  </label>
                  <select
                    id={`status-${report.id}`}
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as ReportStatus)}
                    className="h-9 w-full rounded-md border border-border bg-bg px-3 text-body-sm text-fg transition-colors duration-fast hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                  >
                    {(Object.keys(STATUS_LABELS) as ReportStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`note-${report.id}`}
                    className="text-[11px] uppercase tracking-[0.2em] text-fg-muted font-medium"
                  >
                    Ghi chú admin
                  </label>
                  <textarea
                    id={`note-${report.id}`}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={2}
                    placeholder="Ghi chú nội bộ (tuỳ chọn)…"
                    className="block w-full rounded-md border border-border bg-bg px-3 py-2 text-body-sm text-fg placeholder:text-fg-subtle transition-shadow duration-fast focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  />
                </div>

                {errorText && (
                  <p className="text-body-sm text-destructive" role="alert">
                    {errorText}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateM.mutate()}
                    disabled={!dirty || updateM.isPending}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-fg px-4 text-body-sm font-semibold text-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    {updateM.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    Lưu
                  </button>
                  {updateM.isSuccess && (
                    <span className="text-body-sm text-emerald-600 dark:text-emerald-400">
                      Đã lưu
                    </span>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api-client';
import { ChapterCrawlPanel } from '@/components/admin/ChapterCrawlPanel';
import { StubBadge } from '@/components/admin/StubBadge';
import type { DiscoveryStatus } from '@/api/discover';

export const Route = createFileRoute('/admin/stories/$id')({
  component: AdminStoryDetail,
});

interface StoryRow {
  id: string;
  title: string;
  author: string | null;
  status: string;
  totalChapters: number;
  slug: string;
  discoveryStatus: DiscoveryStatus;
  discoveryError: string | null;
  discoveredAt: string | null;
  autoRefresh: boolean;
}

interface ChapterRow {
  id: string;
  index: string;
  title: string;
  status: 'pending' | 'crawled' | 'failed';
  lastError: string | null;
  crawledAt: string | null;
  size: number | null;
}

const STATUS_META: Record<string, { tone: string; icon: typeof CheckCircle2 }> = {
  crawled: { tone: 'text-emerald-600', icon: CheckCircle2 },
  pending: { tone: 'text-fg-muted', icon: Clock },
  failed: { tone: 'text-destructive', icon: AlertCircle },
};

const STATUS_FALLBACK = { tone: 'text-fg-muted', icon: Clock };

function AdminStoryDetail() {
  const { id } = Route.useParams();

  const storyQ = useQuery({
    queryKey: ['admin', 'story', id],
    queryFn: () => api.get<StoryRow>(`/stories/${id}`).then((r) => r.data),
    // Poll while discovery is running so the UI moves through running → complete
    refetchInterval: (q) =>
      (q.state.data as StoryRow | undefined)?.discoveryStatus === 'running' ? 5000 : false,
  });

  const chaptersQ = useQuery({
    queryKey: ['admin', 'story', id, 'chapters'],
    queryFn: () => api.get<ChapterRow[]>(`/stories/${id}/chapters`).then((r) => r.data),
    enabled: storyQ.data?.discoveryStatus === 'complete',
  });

  const story = storyQ.data;
  const chapters = chaptersQ.data ?? [];

  if (storyQ.isLoading)
    return <p className="text-sm text-fg-muted">Đang tải...</p>;
  if (!story)
    return <p className="text-sm text-destructive">Không tìm thấy truyện.</p>;

  const isStub = story.discoveryStatus !== 'complete';
  const crawledCount = chapters.filter((c) => c.status === 'crawled').length;
  const pendingCount = chapters.filter((c) => c.status === 'pending').length;
  const failedCount = chapters.filter((c) => c.status === 'failed').length;

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/admin/stories"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-fg-muted hover:text-fg transition-colors duration-200 cursor-pointer mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Truyện
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-sans font-bold text-3xl sm:text-4xl tracking-tight">
            {story.title}
          </h1>
          <StubBadge status={story.discoveryStatus} />
        </div>
        <p className="text-sm text-fg-muted mt-2">
          {story.author ?? 'Khuyết danh'}
          {!isStub && ` · ${story.totalChapters} chapter`}
          {' · '}
          <a
            href={`/truyen/${story.slug}`}
            className="hover:text-fg transition-colors duration-200 underline-offset-4 hover:underline cursor-pointer"
          >
            /truyen/{story.slug}
          </a>
        </p>
      </div>

      {isStub && <DiscoveryStateBanner story={story} />}

      {!isStub && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat icon={CheckCircle2} label="Đã crawl" value={crawledCount} tone="positive" />
          <Stat icon={Clock} label="Chờ" value={pendingCount} />
          <Stat icon={AlertCircle} label="Lỗi" value={failedCount} tone={failedCount > 0 ? 'warning' : 'neutral'} />
        </div>
      )}

      <ChapterCrawlPanel storyId={id} discoveryStatus={story.discoveryStatus} />

      {!isStub && <AutoRefreshToggle id={id} autoRefresh={story.autoRefresh} />}

      {!isStub && (
        <div className="rounded-xl border border-border bg-bg overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-sans font-semibold text-base">Danh sách chapter</h2>
            <span className="text-xs text-fg-muted tabular-nums">{chapters.length}</span>
          </div>
          {chaptersQ.isLoading ? (
            <p className="text-sm text-fg-muted p-8 text-center">Đang tải...</p>
          ) : chapters.length === 0 ? (
            <p className="text-sm text-fg-muted p-8 text-center">Chưa có chapter.</p>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg z-10">
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-2.5 w-16 text-[11px] uppercase tracking-wider font-medium text-fg-muted tabular-nums">
                      #
                    </th>
                    <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                      Tiêu đề
                    </th>
                    <th className="px-5 py-2.5 w-28 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                      Trạng thái
                    </th>
                    <th className="px-5 py-2.5 w-24 text-[11px] uppercase tracking-wider font-medium text-fg-muted tabular-nums">
                      Bytes
                    </th>
                    <th className="px-5 py-2.5 text-[11px] uppercase tracking-wider font-medium text-fg-muted">
                      Lỗi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chapters.map((c) => {
                    const meta = STATUS_META[c.status] ?? STATUS_FALLBACK;
                    const Icon = meta.icon;
                    return (
                      <tr key={c.id} className="border-b border-border/60 last:border-0">
                        <td className="px-5 py-2 font-mono text-xs text-fg-muted tabular-nums">
                          {c.index}
                        </td>
                        <td className="px-5 py-2 text-sm">{c.title}</td>
                        <td className="px-5 py-2">
                          <span className={`inline-flex items-center gap-1 text-xs ${meta.tone}`}>
                            <Icon className="h-3 w-3" />
                            {c.status}
                          </span>
                        </td>
                        <td className="px-5 py-2 text-xs text-fg-muted tabular-nums">
                          {c.size ?? '—'}
                        </td>
                        <td className="px-5 py-2 text-xs text-destructive truncate max-w-xs">
                          {c.lastError ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AutoRefreshToggle({ id, autoRefresh }: { id: string; autoRefresh: boolean }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (next: boolean) =>
      api.patch(`/stories/${id}/auto-refresh`, { autoRefresh: next }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'story', id] }),
  });
  return (
    <div className="rounded-xl border border-border bg-bg p-4 flex items-start gap-3">
      <RefreshCw className="h-4 w-4 text-fg-muted mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Auto-refresh chương mới</p>
        <p className="text-xs text-fg-muted mt-0.5">
          Khi cron tự động quét chạy, truyện này có nằm trong danh sách quét hay không. Tắt nếu
          truyện đã dropped / không còn chương mới để tiết kiệm rate-limit cho nguồn.
        </p>
      </div>
      <label className="inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => mut.mutate(e.target.checked)}
          disabled={mut.isPending}
          className="sr-only peer"
        />
        <span className="w-10 h-5 bg-bg-subtle peer-checked:bg-[var(--accent)] rounded-full relative transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-bg after:h-4 after:w-4 after:rounded-full after:transition-transform after:duration-200 peer-checked:after:translate-x-5" />
      </label>
    </div>
  );
}

function DiscoveryStateBanner({ story }: { story: StoryRow }) {
  if (story.discoveryStatus === 'running') {
    return (
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm">
        <p className="font-medium text-blue-700">Đang quét danh sách chương từ nguồn...</p>
        <p className="text-blue-700/80 text-xs mt-1">
          Trang sẽ tự cập nhật khi xong (~30 giây cho 1000 chương ở 1 rps).
        </p>
      </div>
    );
  }
  if (story.discoveryStatus === 'failed') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <p className="font-medium text-destructive">Quét danh sách chương lỗi</p>
        {story.discoveryError && (
          <p className="text-destructive/80 text-xs mt-1 font-mono break-all">
            {story.discoveryError}
          </p>
        )}
        <p className="text-destructive/80 text-xs mt-2">
          Bấm "Quét danh sách chương" bên dưới để thử lại.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      <p className="font-medium text-amber-700">Truyện này chỉ có metadata</p>
      <p className="text-amber-700/80 text-xs mt-1">
        Bấm "Quét danh sách chương" bên dưới để fetch chapter list từ nguồn, rồi mới crawl được nội
        dung.
      </p>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  const valueClass =
    tone === 'warning' && value > 0
      ? 'text-[var(--accent)]'
      : 'text-fg';
  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <div className="flex items-center gap-2 text-fg-muted">
        <Icon className="h-4 w-4" />
        <p className="text-xs uppercase tracking-[0.18em] font-medium">{label}</p>
      </div>
      <div className={`mt-2 font-sans font-bold text-2xl tabular-nums ${valueClass}`}>
        {value.toLocaleString('vi-VN')}
      </div>
    </div>
  );
}

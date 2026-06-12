import {
  type AutoCrawlSetting,
  type AutoRefreshSetting,
  getAutoCrawl,
  getAutoRefresh,
  runAutoRefreshNow,
  updateAutoCrawl,
  updateAutoRefresh,
} from '@/api/settings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Loader2, Play, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/admin/settings')({
  component: AdminSettingsPage,
});

const PRESETS: { label: string; cron: string; note: string }[] = [
  { label: 'Mỗi 6 giờ', cron: '0 */6 * * *', note: '00:00, 06:00, 12:00, 18:00' },
  { label: 'Mỗi 12 giờ', cron: '0 */12 * * *', note: '00:00, 12:00' },
  { label: 'Hàng ngày 2h sáng', cron: '0 2 * * *', note: 'Mỗi ngày lúc 02:00 (giờ VN)' },
  { label: 'Hàng ngày 8h sáng', cron: '0 8 * * *', note: 'Mỗi ngày lúc 08:00 (giờ VN)' },
  { label: 'Hàng tuần (Chủ Nhật 3h)', cron: '0 3 * * 0', note: 'Mỗi Chủ Nhật 03:00' },
];

function AdminSettingsPage() {
  const qc = useQueryClient();
  const settingQ = useQuery({
    queryKey: ['admin', 'settings', 'auto-refresh'],
    queryFn: getAutoRefresh,
  });
  const autoCrawlQ = useQuery({
    queryKey: ['admin', 'settings', 'auto-crawl'],
    queryFn: getAutoCrawl,
  });

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-fg-muted font-medium mb-2">
          Hệ thống
        </p>
        <h1 className="font-sans font-bold text-3xl sm:text-4xl tracking-tight">Cài đặt</h1>
        <p className="text-sm text-fg-muted mt-2">
          Tinh chỉnh các tự động hoá trong hệ thống — không cần redeploy.
        </p>
      </div>

      {settingQ.isLoading && <p className="text-sm text-fg-muted">Đang tải...</p>}
      {settingQ.data && (
        <AutoRefreshCard
          setting={settingQ.data}
          onUpdated={() =>
            qc.invalidateQueries({ queryKey: ['admin', 'settings', 'auto-refresh'] })
          }
        />
      )}
      {autoCrawlQ.data && (
        <AutoCrawlCard
          setting={autoCrawlQ.data}
          onUpdated={() => qc.invalidateQueries({ queryKey: ['admin', 'settings', 'auto-crawl'] })}
        />
      )}
    </div>
  );
}

function AutoRefreshCard({
  setting,
  onUpdated,
}: {
  setting: AutoRefreshSetting;
  onUpdated: () => void;
}) {
  const [enabled, setEnabled] = useState(setting.autoRefreshEnabled);
  const [cron, setCron] = useState(setting.autoRefreshCron);
  const [scope, setScope] = useState<'ongoing' | 'all'>(setting.autoRefreshScope);
  const [concurrency, setConcurrency] = useState(setting.autoRefreshConcurrency);
  const [okFlash, setOkFlash] = useState(false);

  // Reset local form whenever server data changes (e.g. after save)
  useEffect(() => {
    setEnabled(setting.autoRefreshEnabled);
    setCron(setting.autoRefreshCron);
    setScope(setting.autoRefreshScope);
    setConcurrency(setting.autoRefreshConcurrency);
  }, [
    setting.updatedAt,
    setting.autoRefreshEnabled,
    setting.autoRefreshCron,
    setting.autoRefreshScope,
    setting.autoRefreshConcurrency,
  ]);

  const saveM = useMutation({
    mutationFn: () => updateAutoRefresh({ enabled, cron: cron.trim(), scope, concurrency }),
    onSuccess: () => {
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 2500);
      onUpdated();
    },
  });

  const runM = useMutation({
    mutationFn: runAutoRefreshNow,
    onSuccess: () => onUpdated(),
  });

  const dirty =
    enabled !== setting.autoRefreshEnabled ||
    cron.trim() !== setting.autoRefreshCron ||
    scope !== setting.autoRefreshScope ||
    concurrency !== setting.autoRefreshConcurrency;

  const errMsg = (saveM.error || runM.error) as {
    response?: { data?: { message?: string } };
  } | null;
  const errorText = errMsg?.response?.data?.message ?? null;

  return (
    <section className="rounded-xl border border-border bg-bg overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-border/60 flex items-start gap-3">
        <SettingsIcon className="h-5 w-5 text-fg-muted mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-sans font-semibold text-lg">Tự động quét truyện đã crawl</h2>
          <p className="text-sm text-fg-muted mt-1">
            Định kỳ phát hiện chương mới ở những truyện đã hoàn thành discovery và crawl về.
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--accent)] cursor-pointer"
          />
          <span>
            <span className="block text-sm font-medium">Bật lịch tự động</span>
            <span className="block text-xs text-fg-muted mt-0.5">
              Khi tắt, cron job được gỡ khỏi hàng đợi. Nút "Chạy ngay" vẫn dùng được.
            </span>
          </span>
        </label>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-fg/80 uppercase tracking-[0.18em]">
            Lịch chạy
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const active = p.cron === cron.trim();
              return (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => setCron(p.cron)}
                  className={
                    active
                      ? 'inline-flex items-center h-8 px-3 rounded-full text-xs font-medium bg-fg text-bg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2'
                      : 'inline-flex items-center h-8 px-3 rounded-full text-xs border border-border hover:border-fg/40 hover:bg-bg-subtle/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="cron expression (5 trường)"
            className="w-full h-10 px-3 mt-2 rounded-md border border-border bg-bg text-sm font-mono focus:outline-none focus:border-fg/40 focus:ring-2 focus:ring-accent/20 transition-all duration-200"
          />
          <p className="text-xs text-fg-muted">
            Múi giờ: Asia/Ho_Chi_Minh.{' '}
            {PRESETS.find((p) => p.cron === cron.trim())?.note ??
              'Cron tuỳ chỉnh — validate khi lưu.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5 block">
            <span className="text-[11px] font-medium text-fg/80 uppercase tracking-[0.18em]">
              Phạm vi
            </span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'ongoing' | 'all')}
              className="w-full h-10 px-3 rounded-md border border-border bg-bg text-sm cursor-pointer focus:outline-none focus:border-fg/40 focus:ring-2 focus:ring-accent/20"
            >
              <option value="ongoing">Chỉ truyện đang ra</option>
              <option value="all">Tất cả truyện đã discovery xong</option>
            </select>
          </label>

          <label className="space-y-1.5 block">
            <span className="text-[11px] font-medium text-fg/80 uppercase tracking-[0.18em]">
              Concurrency
            </span>
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-md border border-border bg-bg text-sm cursor-pointer focus:outline-none focus:border-fg/40 focus:ring-2 focus:ring-accent/20"
            >
              {[1, 3, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n} truyện song song
                </option>
              ))}
            </select>
          </label>
        </div>

        {errorText && <p className="text-sm text-destructive">{errorText}</p>}

        <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-fg-muted">
            {setting.lastRunAt ? (
              <>
                Lần chạy cuối:{' '}
                <span className="text-fg tabular-nums">
                  {new Date(setting.lastRunAt).toLocaleString('vi-VN')}
                </span>{' '}
                · enqueue {setting.lastRunCount ?? 0} truyện
              </>
            ) : (
              'Chưa chạy lần nào.'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runM.mutate()}
              disabled={runM.isPending}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-sm border border-border hover:border-fg/40 hover:bg-bg-subtle/60 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              Chạy ngay
            </button>
            <button
              type="button"
              onClick={() => saveM.mutate()}
              disabled={!dirty || saveM.isPending}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-fg text-bg hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveM.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Lưu thay đổi
            </button>
            {okFlash && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                <Check className="h-4 w-4" /> Đã lưu
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AutoCrawlCard({
  setting,
  onUpdated,
}: {
  setting: AutoCrawlSetting;
  onUpdated: () => void;
}) {
  const [enabled, setEnabled] = useState(setting.autoCrawlEnabled);
  const [watermark, setWatermark] = useState(setting.autoCrawlWatermark);
  const [okFlash, setOkFlash] = useState(false);

  useEffect(() => {
    setEnabled(setting.autoCrawlEnabled);
    setWatermark(setting.autoCrawlWatermark);
  }, [setting.autoCrawlEnabled, setting.autoCrawlWatermark]);

  const saveM = useMutation({
    mutationFn: () => updateAutoCrawl({ autoCrawlEnabled: enabled, autoCrawlWatermark: watermark }),
    onSuccess: () => {
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 2500);
      onUpdated();
    },
  });

  const dirty = enabled !== setting.autoCrawlEnabled || watermark !== setting.autoCrawlWatermark;
  const errMsg = saveM.error as { response?: { data?: { message?: string } } } | null;
  const errorText = errMsg?.response?.data?.message ?? null;

  return (
    <section className="rounded-xl border border-border bg-bg overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-border/60 flex items-start gap-3">
        <SettingsIcon className="h-5 w-5 text-fg-muted mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-sans font-semibold text-lg">Tự động crawl backlog</h2>
          <p className="text-sm text-fg-muted mt-1">
            Tự động crawl dần các chương "Cần crawl" (mới nhất trước), 1 chương/giây, ưu tiên thấp
            nhất nên không ảnh hưởng thao tác tay hay người đọc. Hết backlog thì tự dừng.
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--accent)] cursor-pointer"
          />
          <span>
            <span className="block text-sm font-medium">Bật auto-crawl</span>
            <span className="block text-xs text-fg-muted mt-0.5">
              Khi tắt, feeder ngừng châm job ngay (job đang chạy vẫn hoàn tất).
            </span>
          </span>
        </label>

        <label className="space-y-1.5 block max-w-xs">
          <span className="text-[11px] font-medium text-fg/80 uppercase tracking-[0.18em]">
            Watermark (số job tối đa trong hàng đợi)
          </span>
          <input
            type="number"
            min={50}
            max={2000}
            value={watermark}
            onChange={(e) => setWatermark(Number(e.target.value))}
            className="w-full h-10 px-3 rounded-md border border-border bg-bg text-sm tabular-nums focus:outline-none focus:border-fg/40 focus:ring-2 focus:ring-accent/20 transition-all duration-200"
          />
          <span className="block text-xs text-fg-muted">
            Càng thấp càng nhẹ. Mặc định 500 (giới hạn 50–2000).
          </span>
        </label>

        {errorText && <p className="text-sm text-destructive">{errorText}</p>}

        <div className="pt-2 border-t border-border/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => saveM.mutate()}
            disabled={!dirty || saveM.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium bg-fg text-bg hover:opacity-90 transition-opacity duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveM.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Lưu thay đổi
          </button>
          {okFlash && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <Check className="h-4 w-4" /> Đã lưu
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

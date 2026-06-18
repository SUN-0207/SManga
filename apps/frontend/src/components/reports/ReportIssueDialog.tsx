import { type CreateReportBody, type ReportCategory, submitReport } from '@/api/reports';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ReportIssueDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCategory?: ReportCategory;
  storyId?: string;
  chapterId?: string;
  contextLabel?: string;
}

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  content: 'Lỗi nội dung chương',
  comment: 'Bình luận xấu',
  technical: 'Lỗi kỹ thuật',
  other: 'Khác',
};

const MAX_CHARS = 2000;
const MIN_CHARS = 5;

export function ReportIssueDialog({
  open,
  onOpenChange,
  defaultCategory,
  storyId,
  chapterId,
  contextLabel,
}: ReportIssueDialogProps) {
  const [category, setCategory] = useState<ReportCategory>(defaultCategory ?? 'other');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync category when defaultCategory prop changes (e.g. dialog reused across entry points)
  useEffect(() => {
    setCategory(defaultCategory ?? 'other');
  }, [defaultCategory]);

  // Reset form state whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setMessage('');
    setSent(false);
    mutation.reset();
    // Focus textarea after open transition
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
    // mutation.reset is stable; intentionally omitting it from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Body scroll-lock while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Clear auto-close timer on unmount to avoid setState-after-unmount
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: (body: CreateReportBody) => submitReport(body),
    onSuccess: () => {
      setSent(true);
      closeTimerRef.current = setTimeout(() => onOpenChange(false), 1500);
    },
  });

  const errObj = mutation.error as { response?: { data?: { message?: string } } } | null;
  const errorText = errObj?.response?.data?.message ?? null;

  const trimmed = message.trim();
  const isValid = trimmed.length >= MIN_CHARS && trimmed.length <= MAX_CHARS;
  const canSubmit = isValid && !mutation.isPending && !sent;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({ category, message: trimmed, storyId, chapterId });
  }

  if (!open) return null;

  return createPortal(
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        aria-label="Đóng báo lỗi"
        className="absolute inset-0 bg-fg/40 backdrop-blur-sm cursor-default"
      />

      {/* Panel */}
      <dialog
        open
        aria-modal="true"
        aria-label="Báo cáo vấn đề"
        className="relative w-full max-w-md bg-bg-elevated rounded-2xl border border-border shadow-elev flex flex-col overflow-hidden m-0 p-0"
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-5">
          <h2 className="font-sans text-heading-lg text-fg">Báo cáo vấn đề</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Đóng"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {/* Context label (read-only) */}
          {contextLabel && (
            <p className="text-body-sm text-fg-muted bg-bg-subtle rounded-md px-3 py-2 border border-border">
              <span className="text-fg-subtle">Liên quan:</span>{' '}
              <span className="text-fg">{contextLabel}</span>
            </p>
          )}

          {/* Category select */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-category" className="text-body-sm font-medium text-fg">
              Loại vấn đề
            </label>
            <select
              id="report-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              disabled={mutation.isPending || sent}
              className="w-full h-10 rounded-md border border-border bg-bg px-3 text-body text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {(Object.entries(CATEGORY_LABELS) as [ReportCategory, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* Message textarea */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="report-message" className="text-body-sm font-medium text-fg">
                Mô tả vấn đề
              </label>
              <span
                className={`text-label tabular-nums ${
                  trimmed.length > MAX_CHARS ? 'text-destructive' : 'text-fg-subtle'
                }`}
              >
                {trimmed.length}/{MAX_CHARS}
              </span>
            </div>
            <textarea
              id="report-message"
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={mutation.isPending || sent}
              placeholder="Mô tả ngắn gọn vấn đề bạn gặp phải..."
              rows={4}
              className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-body text-fg placeholder:text-fg-subtle outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="text-label text-fg-subtle">Tối thiểu {MIN_CHARS} ký tự.</p>
          </div>

          {/* Error message */}
          {errorText && (
            <p role="alert" className="text-body-sm text-destructive">
              {errorText}
            </p>
          )}

          {/* Success state */}
          {sent && (
            <output className="block text-body-sm text-accent font-medium text-center">
              Đã gửi. Cảm ơn bạn!
            </output>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-10 rounded-md bg-accent-gradient text-white text-body-sm font-semibold shadow-glow-pink-soft hover:shadow-glow-pink transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {mutation.isPending ? 'Đang gửi...' : sent ? 'Đã gửi' : 'Gửi báo cáo'}
          </button>
        </form>
      </dialog>
    </div>,
    document.body,
  );
}

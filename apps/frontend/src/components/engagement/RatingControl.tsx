import { engagementApi } from '@/api/engagement';
import { useAuthStore } from '@/stores/auth-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RatingStars } from './RatingStars';

type StarValue = 1 | 2 | 3 | 4 | 5;

/** Minimal non-blocking inline toast — bridges the gap until Sonner/react-hot-toast lands in the app shell. */
function useInlineToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(id);
  }, [message]);

  return { message, show: setMessage } as const;
}

/** Extract HTTP status from an axios-style error object. */
function httpStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { status?: unknown } }).response;
    return typeof r?.status === 'number' ? r.status : null;
  }
  return null;
}

interface RatingControlProps {
  readonly storyId: string;
  /** TanStack Query key for the story query — invalidated on successful mutation. */
  readonly slug: string;
  /** Initial avg from story query — displayed before the dedicated rating query resolves. */
  readonly ratingAvg: number | null;
  readonly ratingCount: number;
}

export function RatingControl({ storyId, slug, ratingAvg, ratingCount }: RatingControlProps) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const toast = useInlineToast();

  // Only fire the rating point-lookup when the user is logged in.
  // This keeps GET /stories/by-slug/:slug cacheable for anonymous users.
  const ratingQ = useQuery({
    queryKey: ['rating', storyId],
    queryFn: () => engagementApi.getRating(storyId),
    enabled: !!user,
  });

  const mine = (ratingQ.data?.mine ?? null) as StarValue | null;
  const avg = ratingQ.data?.avg ?? ratingAvg;
  const count = ratingQ.data?.count ?? ratingCount;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['rating', storyId] }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ['story', slug] }).catch(() => undefined);
  };

  const upsert = useMutation({
    mutationFn: (v: StarValue) => engagementApi.upsertRating(storyId, v),
    // Optimistic: set local cache immediately, server confirms within ~200ms
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['rating', storyId] });
      const prev = qc.getQueryData(['rating', storyId]);
      qc.setQueryData(['rating', storyId], (old: typeof ratingQ.data) =>
        old ? { ...old, mine: v } : old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(['rating', storyId], ctx?.prev);
      if (httpStatus(err) === 401) {
        toast.show('Vui lòng đăng nhập lại');
      }
      // Silent rollback for other errors — toast infra pending
    },
    onSuccess: invalidate,
  });

  const del = useMutation({
    mutationFn: () => engagementApi.deleteRating(storyId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['rating', storyId] });
      const prev = qc.getQueryData(['rating', storyId]);
      qc.setQueryData(['rating', storyId], (old: typeof ratingQ.data) =>
        old ? { ...old, mine: null } : old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(['rating', storyId], ctx?.prev);
      if (httpStatus(err) === 401) {
        toast.show('Vui lòng đăng nhập lại');
      }
      // Silent rollback for other errors — toast infra pending
    },
    onSuccess: invalidate,
  });

  // Spec requirement: anonymous click on stars fires a one-shot inline toast
  // ('Đăng nhập để đánh giá'). Stars remain interactive for anonymous users.
  function handleChange(v: StarValue | null) {
    if (!user) {
      toast.show('Đăng nhập để đánh giá');
      return;
    }
    if (v === null) del.mutate();
    else upsert.mutate(v);
  }

  const isPending = upsert.isPending || del.isPending;

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-2 ${isPending ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {/* Always pass onChange so stars are interactive for anonymous users (spec: click fires toast) */}
        <RatingStars value={avg} mine={mine} onChange={handleChange} size="md" />
        {count > 0 ? (
          <span className="text-body-sm text-fg-muted">({count} đánh giá)</span>
        ) : (
          <span className="text-body-sm text-fg-muted">Chưa có đánh giá</span>
        )}
      </div>

      {/* Inline toast — replaces window.alert(); auto-dismisses after 3 s */}
      {toast.message && (
        <p
          role="status"
          aria-live="polite"
          className="text-body-sm text-accent font-medium animate-fade-in"
        >
          {toast.message}
        </p>
      )}

      {/* Anonymous hint — supplemental UX (link below stars); primary UX is the click toast above */}
      {!user && (
        <p className="text-body-sm text-fg-subtle">
          <a
            href={`/dang-nhap?redirect=/truyen/${slug}`}
            className="text-accent hover:underline cursor-pointer"
          >
            Đăng nhập
          </a>{' '}
          để đánh giá
        </p>
      )}
    </div>
  );
}

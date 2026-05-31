import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { engagementApi } from '@/api/engagement';
import { RatingStars } from './RatingStars';

type StarValue = 1 | 2 | 3 | 4 | 5;

interface RatingControlProps {
  storyId:     string;
  /** TanStack Query key for the story query — invalidated on successful mutation. */
  slug:        string;
  /** Initial avg from story query — displayed before the dedicated rating query resolves. */
  ratingAvg:   number | null;
  ratingCount: number;
}

export function RatingControl({ storyId, slug, ratingAvg, ratingCount }: RatingControlProps) {
  const user = useAuthStore((s) => s.user);
  const qc   = useQueryClient();

  // Only fire the rating point-lookup when the user is logged in.
  // This keeps GET /stories/by-slug/:slug cacheable for anonymous users.
  const ratingQ = useQuery({
    queryKey: ['rating', storyId],
    queryFn:  () => engagementApi.getRating(storyId),
    enabled:  !!user,
  });

  const mine  = (ratingQ.data?.mine ?? null) as StarValue | null;
  const avg   = ratingQ.data?.avg   ?? ratingAvg;
  const count = ratingQ.data?.count ?? ratingCount;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['rating', storyId] });
    void qc.invalidateQueries({ queryKey: ['story',  slug] });
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
    onError: (_err, _v, ctx) => {
      qc.setQueryData(['rating', storyId], ctx?.prev);
      // TODO: replace console.error with a proper toast once a toast system is wired in the app shell.
      // There is currently no 'smanga:toast' CustomEvent listener anywhere in the FE codebase —
      // dispatching that event would be silently ignored. Using console.error as MVP fallback.
      console.error('Rating mutation failed — optimistic update rolled back');
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
    onError: (_err, _v, ctx) => {
      qc.setQueryData(['rating', storyId], ctx?.prev);
      // TODO: replace console.error with a proper toast once a toast system is wired in the app shell.
      console.error('Rating delete failed — optimistic update rolled back');
    },
    onSuccess: invalidate,
  });

  // Spec requirement: anonymous click on stars must fire a one-shot toast
  // ('Đăng nhập để đánh giá') — NOT silently ignore the click.
  // Pass handleChange to RatingStars even for anonymous users so the stars
  // remain interactive and can trigger the toast on click.
  function handleChange(v: StarValue | null) {
    if (!user) {
      // Anonymous: show login prompt as a native alert (MVP — no toast infra yet).
      // TODO: replace with a proper toast once a smanga:toast listener is wired in the app shell.
      window.alert('Đăng nhập để đánh giá');
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
        <RatingStars
          value={avg}
          mine={mine}
          onChange={handleChange}
          size="md"
        />
        {count > 0 ? (
          <span className="text-body-sm text-fg-muted">({count} đánh giá)</span>
        ) : (
          <span className="text-body-sm text-fg-muted">Chưa có đánh giá</span>
        )}
      </div>
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

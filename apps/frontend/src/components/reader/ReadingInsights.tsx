import { useQuery } from '@tanstack/react-query';
import { Flame, Clock } from 'lucide-react';
import { meApi } from '@/api/me';
import { useAuthStore } from '@/stores/auth-store';

interface Props {
  storyId: string;
  /**
   * When true the component renders. Caller is responsible for only passing
   * true when the user already has reading_progress rows for this story
   * (e.g. derived from the ETA query itself or from the continue-reading data).
   */
  hasProgress: boolean;
}

/**
 * ReadingInsights — single-row ETA strip shown below the story hero CTAs.
 *
 * Only renders when:
 *  - user is logged in
 *  - hasProgress is true (avoids fetching for anonymous / first-visit)
 *  - the ETA query returns non-null data (story not finished, has real data)
 *
 * Heuristic: 1500 words/chapter average (documented in stats.service.ts).
 * Days estimate uses 30 min/day as the assumed daily reading session.
 */
export function ReadingInsights({ storyId, hasProgress }: Props) {
  const user = useAuthStore((s) => s.user);

  const etaQ = useQuery({
    queryKey: ['me', 'reading-eta', storyId],
    queryFn: () => meApi.getReadingEta(storyId),
    enabled: !!user && hasProgress,
    staleTime: 5 * 60_000,
  });

  // Don't render until we have a real (non-null) result
  if (!user || !hasProgress) return null;
  if (etaQ.isLoading || !etaQ.data) return null;

  const eta = etaQ.data;
  const estimatedDays = Math.ceil(eta.estimatedMinutes / 30);

  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-3 text-body-sm text-fg-muted"
      aria-label="Thông tin tốc độ đọc"
    >
      <span className="inline-flex items-center gap-1.5">
        <Flame className="h-3.5 w-3.5 text-accent shrink-0" aria-hidden />
        <span>
          Tốc độ đọc:{' '}
          <span className="font-semibold text-fg">{eta.wpmUsed} từ/phút</span>
        </span>
      </span>
      <span className="text-border-strong" aria-hidden>·</span>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-accent shrink-0" aria-hidden />
        <span>
          ETA hoàn thành:{' '}
          <span className="font-semibold text-fg">
            {estimatedDays} ngày
          </span>
          {' '}
          <span className="text-fg-subtle">
            ({eta.remainingChapters} chương còn lại)
          </span>
        </span>
      </span>
    </div>
  );
}

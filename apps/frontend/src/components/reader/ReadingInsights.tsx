import { useQuery } from '@tanstack/react-query';
import { Flame, Clock } from 'lucide-react';
import { meApi } from '@/api/me';
import { useAuthStore } from '@/stores/auth-store';

interface Props {
  readonly storyId: string;
}

/**
 * ReadingInsights — single-row ETA strip shown below the story hero CTAs.
 *
 * Fetches reading speed and ETA in parallel.
 * Hides entirely when:
 *  - user is not logged in
 *  - speed.wordsPerMinute === 0 (insufficient reading data)
 *  - eta is null (no progress on this story, or story already finished)
 *
 * Heuristic: 1500 words/chapter average (documented in stats.service.ts).
 * Days estimate uses 30 min/day as the assumed daily reading session.
 */
export function ReadingInsights({ storyId }: Props) {
  const user = useAuthStore((s) => s.user);

  const speedQ = useQuery({
    queryKey: ['me', 'reading-speed'],
    queryFn: () => meApi.getReadingSpeed(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const etaQ = useQuery({
    queryKey: ['me', 'reading-eta', storyId],
    queryFn: () => meApi.getReadingEta(storyId),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // Hide when not logged in, still loading, or no useful data
  if (!user) return null;
  if (speedQ.isLoading || etaQ.isLoading) return null;

  const speed = speedQ.data;
  const eta = etaQ.data;

  if (!speed || speed.wordsPerMinute === 0 || !eta) return null;

  const estimatedDays = Math.ceil(eta.estimatedMinutes / 30);

  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent/15 bg-accent/5 px-4 py-3 text-body-sm text-fg-muted"
      aria-label="Thông tin tốc độ đọc"
    >
      <span className="inline-flex items-center gap-1.5">
        <Flame className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          Tốc độ đọc:{' '}
          <span className="font-semibold text-fg">{speed.wordsPerMinute} từ/phút</span>
        </span>
      </span>
      <span className="text-border-strong" aria-hidden>·</span>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
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

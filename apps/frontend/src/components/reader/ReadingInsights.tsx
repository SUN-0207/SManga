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
 * Fetch strategy (spec: "only show when user has reading_progress on this story"):
 *  1. etaQ fires for every logged-in user on this story page (1 lightweight request,
 *     stale 5 min). When the user has no progress the BE returns null and we stop.
 *  2. speedQ is gated on etaQ.data !== null — fires only after eta resolves with
 *     actual progress data. This avoids the cross-story reading-speed request for
 *     users who have never read this story.
 *
 * Trade-off: etaQ still fires for all logged-in users (one request per story visit),
 * but this is a single fast query vs the previous spec of a separate progress-check
 * query. speedQ (heavier aggregate) is fully guarded by real progress existence.
 *
 * Heuristic: 1500 words/chapter average (documented in stats.service.ts).
 * Days estimate uses 30 min/day as the assumed daily reading session.
 */
export function ReadingInsights({ storyId }: Props) {
  const user = useAuthStore((s) => s.user);

  // Step 1: probe for progress on this specific story.
  // Returns null (fast) when the user has no progress → speedQ never fires.
  const etaQ = useQuery({
    queryKey: ['me', 'reading-eta', storyId],
    queryFn: () => meApi.getReadingEta(storyId),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // Step 2: only fetch reading speed when etaQ confirmed progress exists.
  // Avoids unnecessary aggregate query for users with no progress on this story.
  const speedQ = useQuery({
    queryKey: ['me', 'reading-speed'],
    queryFn: () => meApi.getReadingSpeed(),
    enabled: !!user && etaQ.data !== null && etaQ.data !== undefined,
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

import { readingProgressApi } from '@/api/reading-progress';
import { useAuthStore } from '@/stores/auth-store';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export function ReadingProgressTracker({
  storyId,
  chapterIndex,
}: {
  storyId: string;
  chapterIndex: number;
}) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
  }, [storyId, chapterIndex]);

  useEffect(() => {
    if (!user || fired.current) return;
    const timer = window.setTimeout(() => {
      readingProgressApi
        .upsert(storyId, chapterIndex)
        .then(() => {
          void qc.invalidateQueries({ queryKey: ['me', 'continue-reading'] });
          void qc.invalidateQueries({ queryKey: ['me', 'stats'] });
          void qc.invalidateQueries({ queryKey: ['me', 'reading-progress'] });
        })
        .catch(() => {
          /* swallow — non-critical */
        });
      fired.current = true;
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [storyId, chapterIndex, user, qc]);

  return null;
}

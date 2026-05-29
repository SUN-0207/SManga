import { useEffect, useRef } from 'react';
import { readingProgressApi } from '@/api/reading-progress';
import { useAuthStore } from '@/stores/auth-store';

export function ReadingProgressTracker({
  storyId,
  chapterIndex,
}: {
  storyId: string;
  chapterIndex: number;
}) {
  const user = useAuthStore((s) => s.user);
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
  }, [storyId, chapterIndex]);

  useEffect(() => {
    if (!user || fired.current) return;
    const timer = window.setTimeout(() => {
      readingProgressApi.upsert(storyId, chapterIndex).catch(() => {
        /* swallow — non-critical */
      });
      fired.current = true;
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [storyId, chapterIndex, user]);

  return null;
}

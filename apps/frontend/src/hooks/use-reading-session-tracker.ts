import { useEffect, useRef } from 'react';
import { readingProgressApi } from '@/api/reading-progress';

/**
 * Tracks time the user actively spends on a chapter and POSTs accumulated
 * session_seconds in batches. Pauses when the tab is hidden. Flushes on
 * unmount, chapter change, or pagehide.
 *
 * Constraints: server caps a single delta at 600s (10 min). We flush every
 * 5 min OR on unmount, whichever first.
 */
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 1000;
const MAX_DELTA = 600;

export function useReadingSessionTracker(
  storyId: string | undefined,
  chapterIndex: string | undefined,
) {
  const secondsRef = useRef(0);
  const visibleRef = useRef(typeof document !== 'undefined' ? !document.hidden : true);

  useEffect(() => {
    if (!storyId || !chapterIndex) return;

    // Reset accumulator on chapter change
    secondsRef.current = 0;

    function flush() {
      const s = secondsRef.current;
      if (s <= 0) return;
      secondsRef.current = 0;
      const payload = Math.min(s, MAX_DELTA);
      // fire-and-forget; ignore errors (e.g., 401 when not logged in)
      void readingProgressApi
        .postSession(storyId!, chapterIndex!, payload)
        .catch(() => {});
    }

    const tickHandle = setInterval(() => {
      if (visibleRef.current) {
        secondsRef.current++;
        // safety: if anyone parks the page open for hours without our flush,
        // cap accumulator at MAX_DELTA so we don't exceed BE limit later.
        if (secondsRef.current >= MAX_DELTA) flush();
      }
    }, TICK_MS);

    const flushHandle = setInterval(flush, FLUSH_INTERVAL_MS);

    function onVisibility() {
      visibleRef.current = !document.hidden;
      if (document.hidden) flush();
    }

    function onPageHide() {
      flush();
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(tickHandle);
      clearInterval(flushHandle);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
  }, [storyId, chapterIndex]);
}

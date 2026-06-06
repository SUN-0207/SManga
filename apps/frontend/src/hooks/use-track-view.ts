import { useEffect } from 'react';

/**
 * Safe accessor for localStorage.
 * Returns null instead of throwing in private-mode browsers where
 * localStorage access raises a SecurityError.
 */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Private mode or security policy — skip dedup; allow counter inflation.
    // Documented behaviour: acceptable for hobby scale.
    return null;
  }
}

/**
 * Fires POST /api/v1/views/story/:storyId once per story per calendar day.
 * Dedup key: smanga:viewed:story:{id}:{YYYY-MM-DD}
 *
 * @param storyId - UUID string from story detail query; pass undefined while data is loading.
 */
export function useTrackStoryView(storyId: string | undefined): void {
  useEffect(() => {
    if (!storyId) return;
    const ls = safeLocalStorage();
    const key = `smanga:viewed:story:${storyId}:${new Date().toISOString().slice(0, 10)}`;
    if (ls?.getItem(key)) return; // already counted today
    ls?.setItem(key, '1');
    // NOTE: fetch() bypasses the axios api-client, so VITE_API_BASE_URL overrides
    // (used by axios) do NOT apply here. In dev, /api/v1 is proxied by vite.config.ts
    // to localhost:3010. In production, Vercel rewrites handle /api/* → Railway.
    // Known limitation: non-default VITE_API_BASE_URL deployments must also update
    // this path or extract: const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
    void fetch(`/api/v1/views/story/${storyId}`, {
      method: 'POST',
      credentials: 'include', // send cookie for auth (not required, but future-safe)
    });
  }, [storyId]);
}

/**
 * Fires POST /api/v1/views/chapter/:chapterId after a 3-second delay.
 * Dedup key: smanga:viewed:chapter:{id}:{YYYY-MM-DD}
 * Timer is cleared on unmount (navigating away before 3s = no count).
 *
 * @param chapterId - UUID string from chapter content query; pass undefined while loading.
 */
export function useTrackChapterView(chapterId: string | undefined): void {
  useEffect(() => {
    if (!chapterId) return;
    const ls = safeLocalStorage();
    const key = `smanga:viewed:chapter:${chapterId}:${new Date().toISOString().slice(0, 10)}`;
    if (ls?.getItem(key)) return; // already counted today

    const t = setTimeout(() => {
      ls?.setItem(key, '1');
      // Same VITE_API_BASE_URL caveat as useTrackStoryView — see comment above.
      void fetch(`/api/v1/views/chapter/${chapterId}`, {
        method: 'POST',
        credentials: 'include',
      });
    }, 3_000);

    return () => clearTimeout(t); // user navigated away — cancel
  }, [chapterId]);
}

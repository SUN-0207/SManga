import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Stores the last-dismissed continue-reading key (storyId:updatedAt).
 * When BE returns a different key (i.e. user has new progress), the bar
 * reappears automatically — no per-session reset, no settings UI needed.
 */
interface DismissStore {
  dismissedKey: string | null;
  dismiss: (key: string) => void;
}

export const useContinueReadingDismiss = create<DismissStore>()(
  persist(
    (set) => ({
      dismissedKey: null,
      dismiss: (key) => set({ dismissedKey: key }),
    }),
    { name: 'smanga:continue-reading-dismiss' },
  ),
);

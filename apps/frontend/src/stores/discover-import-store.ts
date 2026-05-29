import { create } from 'zustand';

/**
 * Tracks selection + in-flight bulk import state on the discover page.
 *
 * - `selected`: set of externalUrls picked via card click + actionbar
 * - `importing`: set of externalUrls whose bulk job has been enqueued but
 *   not yet confirmed complete (reconciled by polling /admin/jobs every 5s,
 *   plus the import-bulk response immediately moves urls here from selected)
 *
 * We don't track per-job state — once the bulk request returns, every
 * `queued` URL is "in flight" until the user navigates back and the page
 * refetches /discover (which will set existingStoryId for completed ones).
 */
interface DiscoverImportState {
  selected: Set<string>;
  importing: Set<string>;
  toggle: (url: string) => void;
  clearSelection: () => void;
  selectAll: (urls: string[]) => void;
  markImporting: (urls: string[]) => void;
  markDone: (urls: string[]) => void;
}

export const useDiscoverImportStore = create<DiscoverImportState>((set) => ({
  selected: new Set(),
  importing: new Set(),

  toggle: (url) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return { selected: next };
    }),

  clearSelection: () => set({ selected: new Set() }),

  selectAll: (urls) => set({ selected: new Set(urls) }),

  markImporting: (urls) =>
    set((s) => {
      const nextSel = new Set(s.selected);
      const nextImp = new Set(s.importing);
      for (const u of urls) {
        nextSel.delete(u);
        nextImp.add(u);
      }
      return { selected: nextSel, importing: nextImp };
    }),

  markDone: (urls) =>
    set((s) => {
      const next = new Set(s.importing);
      for (const u of urls) next.delete(u);
      return { importing: next };
    }),
}));

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ReaderSettings } from './ReaderSettings';
import { useReaderPrefs } from '@/stores/reader-prefs-store';

export function ReaderSettingsDrawer() {
  const open = useReaderPrefs((s) => s.settingsOpen);
  const setOpen = useReaderPrefs((s) => s.setSettingsOpen);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <>
      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Đóng cài đặt"
          className="fixed inset-0 z-40 bg-fg/40 backdrop-blur-sm"
        />
      )}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Cài đặt đọc"
        aria-hidden={!open}
        className={`fixed top-0 right-0 bottom-0 z-50 w-80 sm:w-96 bg-bg-elevated border-l border-border shadow-elev flex flex-col transform transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-14 sm:h-16 px-4 sm:px-5 flex items-center justify-between border-b border-border/60 shrink-0">
          <h2 className="font-sans font-semibold text-heading-md">Cài đặt đọc</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng cài đặt"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-bg-subtle transition-colors duration-fast"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <ReaderSettings />
        </div>
      </aside>
    </>
  );
}

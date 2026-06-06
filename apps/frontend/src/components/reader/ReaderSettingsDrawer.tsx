import { useReaderPrefs } from '@/stores/reader-prefs-store';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { ReaderSettings } from './ReaderSettings';

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
        <header className="flex h-14 items-center justify-between border-b border-border px-5 sm:h-16">
          <h2 className="font-sans text-heading-lg text-fg">Cài đặt đọc</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng cài đặt"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-fast hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <ReaderSettings />
        </div>
      </aside>
    </>
  );
}

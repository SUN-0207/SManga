import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ReaderSettings } from './ReaderSettings';

export function ReaderHeader() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="border-b border-border">
      <div className="container flex items-center justify-between py-4">
        <Link to="/" className="text-xl font-bold font-heading hover:opacity-80 transition-opacity duration-150">
          SManga
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="text-sm hover:underline transition-all duration-150 cursor-pointer"
          >
            Trang chủ
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className="cursor-pointer transition-all duration-200"
          >
            Cài đặt
          </Button>
        </div>
      </div>
      {settingsOpen && (
        <div className="border-t border-border bg-muted/30">
          <div className="container py-4">
            <ReaderSettings />
          </div>
        </div>
      )}
    </header>
  );
}
